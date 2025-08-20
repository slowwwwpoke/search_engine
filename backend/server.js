import express from "express";
import mongoose from "mongoose";
import fetch from "node-fetch";
import cheerio from "cheerio";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/searchengine";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

const pageSchema = new mongoose.Schema({
  url: { type: String, unique: true },
  title: String,
  description: String,
  backlinks: { type: Number, default: 0 },
  lastCrawled: Date,
});
const Page = mongoose.model("Page", pageSchema);

async function savePageData(url, title, description, backlinks) {
  try {
    await Page.findOneAndUpdate(
      { url },
      { title, description, backlinks, lastCrawled: new Date() },
      { upsert: true, new: true }
    );
    console.log(`Saved: ${url}`);
  } catch (err) {
    console.error("Save error:", err.message);
  }
}

async function crawlSite(url, depth = 1, visited = new Set()) {
  if (visited.has(url) || depth > 2) return; // limit recursion depth
  visited.add(url);

  console.log(`Crawling: ${url}`);
  try {
    const res = await fetch(url, { timeout: 10000 });
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").text() || url;
    const description = $('meta[name="description"]').attr("content") || "";
    const links = $("a[href]")
      .map((_, a) => $(a).attr("href"))
      .get()
      .filter(href => href.startsWith("http"));

    // Save page
    await savePageData(url, title, description, links.length);

    // Crawl internal links (basic recursion)
    for (const link of links.slice(0, 5)) { // limit to 5 links per page
      await crawlSite(link, depth + 1, visited);
    }
  } catch (err) {
    console.error(`Crawl failed for ${url}:`, err.message);
  }
}

const popularSites = [
  "https://developer.mozilla.org",
  "https://www.w3schools.com"
];

async function startCrawl() {
  console.log("Starting crawl...");
  for (const site of popularSites) {
    await crawlSite(site);
  }
  console.log("Crawl finished!");
}
startCrawl();


// Search endpoint (partial text match)
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  try {
    const results = await Page.find({
      $or: [
        { title: new RegExp(q, "i") },
        { description: new RegExp(q, "i") },
        { url: new RegExp(q, "i") },
      ],
    }).sort({ backlinks: -1 }).limit(20);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

// Top results endpoint
app.get("/top", async (req, res) => {
  try {
    const results = await Page.find().sort({ backlinks: -1 }).limit(10);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch top results" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
