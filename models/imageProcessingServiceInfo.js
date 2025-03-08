const { model, Schema } = require("mongoose");

const imageProcessingInfo = new Schema(
  {
    productIDs: [{
      type: Schema.Types.ObjectId,
      ref: "products"
    }],
    processingCompleted: {
      type: Boolean,
      default: false,
    },

    outputCSVPath: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = model("imageProcessingInfo", imageProcessingInfo);
