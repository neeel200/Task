const { Router } = require("express");
const { upload } = require("../utils/multer.js");
const {
  processRequest,
  getProcessingRequest,
} = require("../controllers/imageProcessingController.js");

const productRouter = Router();

productRouter.get("/processing-status", getProcessingRequest);
productRouter.post("/request-process", upload.single("file"), processRequest);

module.exports = productRouter;
