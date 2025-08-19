// backend/server.js
import express from "express";
import mongoose from "mongoose";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/search_engine";
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

// Schema
const siteSchema = new mongoose.Schema({
  url: String,
  title: String,
  backlinks: { type: Number, default: 0 },
});
const Site = mongoose.model("Site", siteSchema);

// Crawl function
async function crawl(url, depth = 1, maxDepth = 2, visited = new Set()) {
  if (visited.has(url) || depth > maxDepth) return;
  visited.add(url);

  try {
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) return;
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").text() || url;
    let site = await Site.findOne({ url });
    if (!site) {
      site = new Site({ url, title, backlinks: 0 });
    }
    await site.save();

    const links = $("a[href]")
      .map((_, a) => new URL($(a).attr("href"), url).href)
      .get();

    for (let link of links) {
      if (!visited.has(link)) {
        // increment backlink count for linked pages
        await Site.findOneAndUpdate(
          { url: link },
          { $inc: { backlinks: 1 } },
          { upsert: true }
        );
        await crawl(link, depth + 1, maxDepth, visited);
      }
    }
  } catch (err) {
    console.error("Crawl error for", url, ":", err.message);
  }
}

// API routes
app.get("/", (req, res) => {
  res.send("✅ Search Engine API is running");
});

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  const regex = new RegExp(query, "i");
  const results = await Site.find({
    $or: [{ title: regex }, { url: regex }],
  }).sort({ backlinks: -1 });

  res.json(results);
});

app.post("/crawl", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  crawl(url).then(() => console.log("Crawl finished for", url));
  res.json({ message: `Crawling started for ${url}` });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
