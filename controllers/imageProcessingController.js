const tryCatch = require("../utils/tryCatch");
const csv = require("csvtojson");
const Joi = require("joi");
const { unlink } = require("fs/promises");
const axios = require("axios");
const Product = require("../models/product");
const RequestProcessing = require("../models/imageProcessingServiceInfo");
const { Worker } = require("worker_threads");

const csvValidationSchema = Joi.object({
  "S.No.": Joi.string().required(),
  "Product Name": Joi.string().required(),
  "Input Image Urls": Joi.allow(),
});

const processRequest = tryCatch(async (req, res, next) => {
  const { webhookURL } = req.body;
  const filePath = req.file.path;
  console.log("filepath", filePath);
  // take csv json and validate it
  const json = await csv().fromFile(filePath);

  await unlink(filePath);

  let errors = [];
  json.forEach((obj) => {
    let value = csvValidationSchema.validate(obj);
    if (value.error) {
      value.error.details.forEach((err) => {
        errors.push(err.message);
      });
    }
  });

  // send errors while validation 
  if (errors.length > 0) {
    console.log("validation error from the CSV file");
    return res.json({ status: -1, message: errors });
  } else {
    console.log("CSV validated successfully..");
    // next();
  }

  const productIds = await Promise.all(
    json.map(async (row) => {
      const product = await Product.create({
        name: row["Product Name"],
        images: row["Input Image Urls"],
        skuNumber: row["Product Name"],
      });
      return product._id; 
    })
  );

  // create the processing request document encompassing the productsIDs
  const processingRequestDoc = await RequestProcessing.create({
    productIDs: productIds,
  });

  // set the streaming connection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(
    `data: {"message": "Queued", "processingRequestId": ${processingRequestDoc._id} }\n\n`
  );

  console.log("pp", JSON.stringify(processingRequestDoc._id));

  const worker = new Worker("./workers/imageProcessingWorker.js", {
    workerData: {
      csvToJsonData: json,
      processingRequestID: JSON.stringify(processingRequestDoc._id),
    },
  });

  // when message recieved from the worker thread then update the webhook and client also.
  worker.on("message", async (msg) => {
   
    if (msg["processing"] === "Done") {
      await RequestProcessing.findByIdAndUpdate(
        processingRequestDoc._id,
        {
          $set: { processingCompleted: true },
        }
      );

      res.write(
        `data: {"message": "message from worker thread", "data": ${JSON.stringify(
          msg
        )} }\n\n`
      );

      // send the data to webhook if its provided

      if (webhookURL) {
        await axios({
          method: "POST",
          url: webhookURL,
          data: JSON.stringify(msg),
        });
      }

      // return res.write("Done!");
      res.end()
    }
  });
  worker.on("error", (err) => {
    console.log("error", err);
  });
});

const getProcessingRequest = tryCatch(async (req, res, next) => {

  // when completed revert the output csv file details else output the pending status
  const { processRequestId } = req.query;
  const requestedDetails = await RequestProcessing.findById(processRequestId);
  if (requestedDetails?.processingCompleted === null) {
    return next(new Error("No such Request Exists!"));
  }

  if (requestedDetails.processingCompleted) {
    return res.status(200).json({
      msg: "Request Processed!, Here's the output csv file url.",
      status: requestedDetails.processingCompleted,
      outputFileURL: requestedDetails.outputCSVPath
    });
  }

  return res.status(200).json({
    msg: "Request Pending",
    status: requestedDetails.processingCompleted,
  });
});

module.exports = { processRequest, getProcessingRequest };
