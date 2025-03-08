const multer = require("multer");

const upload = multer({
  dest: "./upload",
  fileFilter: (req, file, cb) => {
    console.log("file", file);
    if (!file.originalname.includes(".csv")) {
      return cb(new Error("Only csv files are allowed"));
    } else {
      cb(null, true);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 mb file size is the limit set
});

module.exports = { upload };
