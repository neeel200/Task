const { parentPort, workerData } = require("worker_threads");
const sharp = require("sharp");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const axios = require("axios");
const { open, unlink } = require("fs/promises");
const { createReadStream } = require("fs");
const RequestProcessingModel = require("../models/imageProcessingServiceInfo");
const DBConnect = require("../DB/db");
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
DBConnect();

const s3 = new S3Client({
  region: "ap-south-1",
  credentials: {
    secretAccessKey: AWS_SECRET_ACCESS_KEY, 
    accessKeyId: AWS_ACCESS_KEY_ID, 
  },
});
// console.log("wdata", workerData);

(async () => {
  const { csvToJsonData, processingRequestID } = workerData;
  const processingID = JSON.parse(processingRequestID);
  console.log("processig request id", JSON.parse(processingRequestID));

  // fetch the image buffer and compress it and store in the s3
  const imageUrlsArray = [];
  csvToJsonData.forEach((obj) => {
    const images = obj["Input Image Urls"].split(",");
    imageUrlsArray.push(images);
  });
  const imagesBuffer = await Promise.all(
    imageUrlsArray.map(async (currentImageArray, index) => {

      // Fetch all images buffer with axios
      const imageBuffers = await Promise.all(
        currentImageArray.map(async (image) => {
          try {
            const response = await axios({
              url: image,
              method: "GET",
              responseType: "arraybuffer",
            });
            return response.data;
          } catch (error) {
            console.error("Error fetching image:", image, error.message);
            return null;
          }
        })
      );

      const validImageBuffers = imageBuffers.filter(
        (buffer) => buffer !== null
      );

      // Compress each image and write to S3
      const compressedImageFilePaths = await Promise.all(
        validImageBuffers.map(async (buffer, index) => {
          try {
            const image = sharp(buffer);
            const meta = await image.metadata();
            const format = meta.format; 
            console.log(
              "initial buffer length",
              buffer.byteLength / (1024 * 1024),
              "MB"
            );

            // Compress image by adjusting quality to 50% 
            const resizedBuffer = await image[format]({
              quality: 50,
            }).toBuffer();

            const fileName = `compressed-${Date.now()}-${index}.${format}`;

            // upload the compressed images to s3
            const uploadParams = {
              Body: resizedBuffer,
              Bucket: AWS_BUCKET_NAME,
              Key: `compressedImages/${fileName}`,
              ContentType: `image/${format}`,
            };

            const result = await s3.send(new PutObjectCommand(uploadParams));
         
            return `https://${AWS_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/compressedImages/${fileName}`;
          } catch (error) {
            console.error("Error compressing image:", error.message);
            return null;
          }
        })
      );

      const processedImageFilepaths = compressedImageFilePaths.filter(
        (filePath) => filePath !== null
      );

      csvToJsonData[index]["Output Image urls"] =
        processedImageFilepaths.join(", ");

      return processedImageFilepaths;
    })
  );

  // build the csv file and upload the file to S3
  const fileDescriptor = await open(`./output-${processingID}.csv`, "a+");

  await fileDescriptor.appendFile(
    "S.No.,Product Name,Input Image Urls,Output Image urls,\n"
  );

  csvToJsonData.map(async (row) => {
    await fileDescriptor.appendFile(
      `${row["S.No."]},${row["Product Name"]},"${row["Input Image Urls"]}","${row["Output Image urls"]}"\n`
    );
  });

  await fileDescriptor.close();

  const uploadParams = {
    Body: createReadStream(`./output-${processingID}.csv`),
    Bucket: AWS_BUCKET_NAME,
    Key: `Output_CSVs/processingID/output-${processingID}.csv`,
    ContentType: `text/csv`,
  };

  const result = await s3.send(new PutObjectCommand(uploadParams));

  // also delete the temp csv file
  await unlink(`./output-${processingID}.csv`);
  await RequestProcessingModel.findByIdAndUpdate(`${processingID}`, {
    $set: {
      outputCSVPath: `https://${AWS_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/Output_CSVs/processingID/output-${processingID}.csv`,
    },
  });

  // successful message to parent thread
  parentPort.postMessage({
    processing: "Done",
    outputCSVFilePath: `https://${AWS_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/Output_CSVs/processingID/output-${processingID}.csv`,
  });
})();
