// server.js
import express from "express";
import mongoose from "mongoose";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import cors from "cors";

// Setup
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/search_engine", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

// ============================
// Schema & Model
// ============================
const pageSchema = new mongoose.Schema({
  title: String,
  url: { type: String, unique: true },
  backlinks: { type: Number, default: 0 },
});
const Page = mongoose.model("Page", pageSchema);

// Crawler
const visited = new Set();
const backlinkMap = new Map();

async function crawlPage(url, depth = 0, maxDepth = 2) {
  if (visited.has(url) || depth > maxDepth) return;
  visited.add(url);

  try {
    console.log(`Crawling: ${url}`);
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) return;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Save page in DB
    await Page.findOneAndUpdate(
      { url },
      {
        title: $("title").text() || url,
        url,
        backlinks: backlinkMap.get(url) || 0,
      },
      { upsert: true }
    );

    // Crawl links found on this page
    const links = $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter((link) => link.startsWith("http"));

    for (const link of links) {
      // Track backlinks
      backlinkMap.set(link, (backlinkMap.get(link) || 0) + 1);
      await crawlPage(link, depth + 1, maxDepth);
    }
  } catch (err) {
    console.error(`Failed to crawl ${url}: ${err.message}`);
  }
}

async function crawlPopularSites() {
  const popularSites = [
    "https://developer.mozilla.org",
    "https://www.w3schools.com",
    "https://stackoverflow.com",
  ];

  console.log("🚀 Starting crawl...");
  for (const site of popularSites) {
    await crawlPage(site);
  }
  console.log("Crawl finished!");
}

// API Routes

// Search API (partial match + sort by backlinks)
app.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const results = await Page.find({
    title: { $regex: q, $options: "i" }, // case-insensitive match
  }).sort({ backlinks: -1 }); // rank by backlinks

  res.json(results);
});

// Trigger crawl manually
app.get("/crawl", async (req, res) => {
  res.write("Crawl started...\n");
  await crawlPopularSites();
  res.write("Crawl finished!\n");
  res.end();
});

// Default route
app.get("/", (req, res) => {
  res.send("Search Engine API is running...");
});

// Start Server
const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
