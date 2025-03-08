const mongoose = require("mongoose")

const DBConnect = async () => {
    try {
        const uri = process.env.MONGO_URI
         mongoose.connect(uri,{dbName:process.env.DB_NAME}).then(()=>{
            console.log("MongoDB connected ! ")
         }).catch(err=>{
            console.log("err", err)
         })

    }
    catch (err) {
        throw new Error("Mongo connection error", err)
    }

}

module.exports = DBConnect