import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/test";

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

/**
 * Crawl a page, extract title/description, follow links, save to MongoDB
 */
async function crawlPage(url, depth = 1, visited = new Set()) {
  if (visited.has(url) || depth <= 0) return;
  visited.add(url);

  try {
    console.log(`Crawling: ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch ${url}: ${res.status}`);
      return;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").text() || url;
    const description =
      $('meta[name="description"]').attr("content") || $("p").first().text();

    // Save or update page in MongoDB
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

    // Extract links for crawling
    const links = [];
    $("a[href]").each((_, el) => {
      let link = $(el).attr("href");
      if (link && link.startsWith("http")) {
        links.push(link);
      }
    });

    // Crawl linked pages (limited depth)
    for (const link of links) {
      await crawlPage(link, depth - 1, visited);

      // Increment backlinks
      await Page.findOneAndUpdate(
        { url: link },
        { $inc: { backlinks: 1 } },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error(`Error crawling ${url}:`, err.message);
  }
}

// API: trigger crawl manually
app.post("/crawl", async (req, res) => {
  const { url, depth } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    await crawlPage(url, depth || 1);
    res.json({ message: `Crawl started for ${url}` });
  } catch (err) {
    res.status(500).json({ error: "Crawl failed", details: err.message });
  }
});

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
    console.error("Error in /search:", err);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

// Root check
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
