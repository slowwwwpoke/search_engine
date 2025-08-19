const API_URL = "https://slowwwwpoke.github.io/search_engine/";

async function search() {
  const query = document.getElementById("query").value.trim();
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = "<p>Searching...</p>";

  try {
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.length === 0) {
      resultsDiv.innerHTML = "<p>No results found.</p>";
      return;
    }

    resultsDiv.innerHTML = data
      .map(
        (item) => `
        <div class="result">
          <a href="${item.url}" target="_blank">${item.title || item.url}</a>
          <p class="backlinks">🔗 Backlinks: ${item.backlinks}</p>
          <p>${item.url}</p>
        </div>
      `
      )
      .join("");
  } catch (err) {
    resultsDiv.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
  }
}
