import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/test";

// Middleware
app.use(cors());
app.use(express.json());

// Define schema
const pageSchema = new mongoose.Schema({
  url: String,
  title: String,
  description: String,
  backlinks: { type: Number, default: 0 },
  lastCrawled: Date,
});

// Ensure we use the same collection
const Page = mongoose.model("Page", pageSchema, "pages");

// Search API
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";

    // Search in title + description + URL (case-insensitive)
    const results = await Page.find({
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { url: { $regex: query, $options: "i" } },
      ],
    })
      .sort({ backlinks: -1 }) // rank by backlinks
      .limit(10);

    console.log("Search results for:", query, results.length);
    res.json(results);
  } catch (err) {
    console.error("Error in /search:", err);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

// Root route (sanity check)
app.get("/", (req, res) => {
  res.json({ message: "Search engine backend running" });
});

// Start server
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });
