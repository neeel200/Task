const { model, Schema } = require("mongoose");

const productSchema = new Schema(
  {
    name: {
      type: String,
    },
    skuNumber: {
      type: String,
    },
    images: [String],
  },
  { timestamps: true }
);

module.exports = model("products", productSchema);
