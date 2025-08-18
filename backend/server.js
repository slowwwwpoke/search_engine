import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";  // fixed ES module import
import { exec } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;
app.use(cors());
app.use(express.json());

// MongoDB data folder
const mongoDataPath = path.join(__dirname, "mongodb-data");
if (!fs.existsSync(mongoDataPath)) fs.mkdirSync(mongoDataPath, { recursive: true });

// Start MongoDB process
const mongodProcess = exec(`mongod --dbpath "${mongoDataPath}" --bind_ip 127.0.0.1`);
process.on("exit", () => mongodProcess.kill());
process.on("SIGINT", () => { mongodProcess.kill(); process.exit(); });
const MONGO_URL = "mongodb://localhost:27017/searchengine";
await mongoose.connect(MONGO_URL, { dbName: "searchengine" });
console.log("Connected to MongoDB!");

// Schema & Model
const pageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    url: { type: String, required: true },
    popularity: { type: Number, default: 0 }
  },
  { timestamps: true }
);
pageSchema.index({ title: "text", content: "text" });
const Page = mongoose.model("Page", pageSchema);

// Seed sample data if empty
async function seedIfEmpty() {
  const count = await Page.countDocuments();
  if (count === 0) {
    const dataPath = path.join(__dirname, "data.json");
    if (fs.existsSync(dataPath)) {
      const items = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      await Page.insertMany(items);
      console.log(`Seeded ${items.length} documents.`);
    }
  }
}
await seedIfEmpty();

// Helper functions
function tokenizeQuery(q) { return [...new Set((q||"").trim().split(/\s+/).filter(Boolean))]; }
function escapeHtml(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function highlight(text, keywords){
  if(!keywords.length) return escapeHtml(text);
  const pattern = new RegExp("("+keywords.map(escapeRegex).join("|")+")","gi");
  return escapeHtml(text).replace(pattern,"<mark>$1</mark>");
}
function buildSnippet(text, keywords, opts={}) {
  const context = opts.context||80;
  const t = text||"";
  if(!keywords.length) return escapeHtml(t.slice(0,context*2)) + (t.length>context*2?"…":"");
  const regex = new RegExp("("+keywords.map(escapeRegex).join("|")+")","i");
  const m = t.match(regex);
  let start = m && m.index!==undefined?Math.max(0,m.index-context):0;
  const end = Math.min(t.length,start+context*2);
  let snippet = t.slice(start,end);
  if(start>0) snippet = "…" + snippet;
  if(end<t.length) snippet += "…";
  return highlight(snippet,keywords);
}

// Crawling popular websites
async function crawlPage(url, popularity=10){
  try{
    const res = await fetch(url,{timeout:10000});
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("title").text() || url;
    const content = $("body").text().replace(/\s+/g," ").trim();
    const exists = await Page.findOne({ url });
    if(!exists){
      await Page.create({ title, content, url, popularity });
      console.log(`Crawled new page: ${url}`);
    } else {
      // Update content if already exists
      exists.title = title;
      exists.content = content;
      await exists.save();
      console.log(`Updated existing page: ${url}`);
    }
  }catch(err){ console.error(`Failed to crawl ${url}: ${err.message}`); }
}

const popularSites = [
  "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  "https://www.w3schools.com/js/",
  "https://www.javascript.com/",
  "https://nodejs.org/en/docs/",
  "https://www.freecodecamp.org/news/tag/javascript/",
  "https://www.google.com"
];

async function crawlPopularSites(){
  for(const url of popularSites) await crawlPage(url,100);
}

// Scheduled crawler (every 6 hours)
const CRAWL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
async function scheduledCrawl() {
  console.log("Running scheduled crawl...");
  await crawlPopularSites();
  console.log("Scheduled crawl completed.");
}
scheduledCrawl();
setInterval(scheduledCrawl, CRAWL_INTERVAL_MS);

// Routes
app.get("/search", async (req,res)=>{
  const q = (req.query.q||"").trim();
  const page = Math.max(parseInt(req.query.page||"1",10),1);
  const limit = Math.min(Math.max(parseInt(req.query.limit||"10",10),1),50);
  const skip = (page-1)*limit;

  if(!q) return res.json({results:[], total:0, page, pages:0, query:q});
  try{
    const [results,total] = await Promise.all([
      Page.find({$text:{$search:q}},{score:{$meta:"textScore"},title:1,content:1,url:1})
        .sort({score:{$meta:"textScore"}})
        .skip(skip).limit(limit).lean(),
      Page.countDocuments({$text:{$search:q}})
    ]);
    const keywords = tokenizeQuery(q);
    const mapped = results.map(r=>({
      _id:r._id, url:r.url, score:r.score,
      title_html: highlight(r.title||"",keywords),
      snippet_html: buildSnippet(r.content||"",keywords,{context:90})
    }));
    res.json({results:mapped,total,page,pages:Math.ceil(total/limit),query:q});
  }catch(err){ console.error(err); res.status(500).json({error:"Search failed"}); }
});

app.get("/suggest", async (req,res)=>{
  const q = (req.query.q||"").trim();
  const limit = Math.min(parseInt(req.query.limit||"5",10),20);
  if(!q) return res.json([]);
  const keywords = q.split(/\s+/).filter(Boolean);
  const regexes = keywords.map(k=>new RegExp(k,"i"));
  try{
    let results = await Page.find({$text:{$search:q}},{score:{$meta:"textScore"},title:1,url:1})
      .sort({score:{$meta:"textScore"}})
      .limit(limit)
      .lean();
    if(results.length<limit){
      const partialResults = await Page.find({$or:regexes.map(r=>({title:r}))},{title:1,url:1})
        .limit(limit-results.length).lean();
      results = results.concat(partialResults);
    }
    res.json(results);
  }catch(err){ console.error(err); res.status(500).json([]); }
});

app.get("/top", async (req,res)=>{
  const limit = Math.min(parseInt(req.query.limit||"10",10),50);
  try{
    const results = await Page.find({}).sort({popularity:-1}).limit(limit).lean();
    res.json(results.map(r=>({
      title_html: r.title,
      snippet_html: r.content.slice(0,150)+"...",
      url: r.url
    })));
  }catch(err){ console.error(err); res.status(500).json([]); }
});

app.get("/health", (_req,res)=>res.json({ok:true}));

// Serve frontend
app.use(express.static(path.join(__dirname,"../frontend")));
app.get("/", (_req,res)=>{
  res.sendFile(path.join(__dirname,"../frontend/index.html"));
});

// Start server
app.listen(PORT,()=>console.log(`Server running at http://localhost:${PORT}`));
