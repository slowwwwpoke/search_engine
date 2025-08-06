document.addEventListener('DOMContentLoaded', () => {
    const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
    const searchInput = document.getElementById('search');
    const resultsList = document.getElementById('results');

    function displayResults(matches) {
        resultsList.innerHTML = '';
        matches.forEach((match) => {
            const li = document.createElement('li');
            li.textContent = match;
            resultsList.appendChild(li);
        });
    }

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        const matches = items.filter((item) => item.includes(query));
        displayResults(matches);
    });
});
