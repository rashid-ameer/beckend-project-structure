import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";

// dot env configuration
dotenv.config({ path: "./env" });

// PORT
const PORT = process.env.PORT || 5000;

// connecting to database
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    app.on("error", (error) => {
      console.log("Error in running server", error);
    });
  })
  .catch((error) => {
    console.log("Error in connecting to database", error);
    process.exit(1);
  });
