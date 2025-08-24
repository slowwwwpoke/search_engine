const API_URL = "https://search-engine-gc3w.onrender.com"; 

async function search() {
  const query = document.getElementById("query").value.trim();
  const resultsDiv = document.getElementById("results");

  if (!query) {
    resultsDiv.innerHTML = "<p style='color:red;'>Please enter a search term.</p>";
    return;
  }

  resultsDiv.innerHTML = "<p>Searching...</p>";

  try {
    const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    console.log("🔍 Backend response:", data);  // <-- DEBUG

    if (!Array.isArray(data) || data.length === 0) {
      resultsDiv.innerHTML = `<p>No results found for "<strong>${query}</strong>".</p>`;
      return;
    }

    resultsDiv.innerHTML = data.map(item => `
      <div class="result">
        <h3><a href="${item.url}" target="_blank">${item.title || item.url}</a></h3>
        <p>${item.description || "No description available."}</p>
        <p class="backlinks">Backlinks: ${item.backlinks || 0}</p>
        <small>${item.url}</small>
      </div>
    `).join("");

  } catch (err) {
    console.error("Fetch error:", err);
    resultsDiv.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
  }
}
