const app = document.querySelector('#gameApp');

try {
  const partialUrl = new URL('../partials/game.html', import.meta.url);
  const response = await fetch(partialUrl);
  if (!response.ok) {
    throw new Error(`Could not load the game interface (${response.status}).`);
  }

  app.innerHTML = await response.text();
  await import('./main.js');
} catch (error) {
  console.error(error);
  app.textContent = 'The game could not be loaded. Please refresh and try again.';
}
