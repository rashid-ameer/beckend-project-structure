import dotenv from "dotenv";
import connectDB from "./db/index.js";

// dot env configuration
dotenv.config({ path: "./env" });

// connecting to database
connectDB();
