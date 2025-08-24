import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 5000;

// Seed URL to crawl when the server starts
const SEED_URL = process.env.SEED_URL || "https://example.com";

// Middleware
app.use(cors());
app.use(express.json());

// Schema
const pageSchema = new mongoose.Schema({
  url: { type: String, unique: true },
  title: String,
  description: String,
  backlinks: { type: Number, default: 0 },
  lastCrawled: Date,
});

const Page = mongoose.model("Page", pageSchema, "pages");

// Crawl function
async function crawl(url, depth = 1) {
  if (depth <= 0) return;

  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").text() || url;
    const description =
      $('meta[name="description"]').attr("content") || "No description found";

    // Save or update page
    await Page.findOneAndUpdate(
      { url },
      {
        url,
        title,
        description,
        lastCrawled: new Date(),
      },
      { upsert: true, new: true }
    );

    // Follow links (depth-limited)
    const links = [];
    $("a[href]").each((_, el) => {
      const link = $(el).attr("href");
      if (link && link.startsWith("http")) {
        links.push(link);
      }
    });

    for (const link of links) {
      await crawl(link, depth - 1);
    }
  } catch (err) {
    console.error(`Crawl error for ${url}:`, err.message);
  }
}

// Search API
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";

    const results = await Page.find({
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { url: { $regex: query, $options: "i" } },
      ],
    })
      .sort({ backlinks: -1 })
      .limit(10);

    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// Crawl API (manual trigger if needed)
app.post("/crawl", async (req, res) => {
  const { url, depth = 1 } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  crawl(url, depth);
  res.json({ message: `Crawling started for ${url} (depth ${depth})` });
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "Search engine backend running" });
});

// Connect DB and start server
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    // Auto-start crawler on boot
    console.log(`Starting crawl on boot with seed URL: ${SEED_URL}`);
    crawl(SEED_URL, 1);
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });
