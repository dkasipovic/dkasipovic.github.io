function updateImageTimestamp(img) {
    const timestamp = new Date().getTime();
    let url = img.src;

    // Remove existing timestamp parameter if present
    url = url.replace(/[?&]t=\d+/g, '');

    // Add or append timestamp parameter
    if (url.includes('?')) {
        url += '&t=' + timestamp;
    } else {
        url += '?t=' + timestamp;
    }

    img.src = url;
}

function reloadAllImages() {
    const images = document.querySelectorAll('img');
    images.forEach(updateImageTimestamp);
}

// Reload immediately on load
reloadAllImages();

// Reload every second (1000 milliseconds)
setInterval(reloadAllImages, 1000);
