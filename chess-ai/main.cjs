const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 1000,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#050a12',
    autoHideMenuBar: true,
    title: "Neural Chess — Human vs. AI"
  });

  // Load the built app
  win.loadFile(path.join(__dirname, 'dist/index.html'));
  
  // Optional: open dev tools for debugging
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
