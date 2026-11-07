// Another app for the dock E2E: one plain window at x y width height (argv), in front. Prints its window id.
const { app, BrowserWindow } = require('electron')
const [x, y, width, height] = process.argv.slice(-4).map(Number)
// Its own taskbar group on Windows, so a click on the app's button is not a click on a combined group.
if (process.platform === 'win32') app.setAppUserModelId('retroplayer.e2e.cover')
app.whenReady().then(() => {
  const w = new BrowserWindow({ x, y, width, height, show: false, title: 'E2E cover' })
  w.once('ready-to-show', () => {
    w.show()
    app.focus({ steal: true })
    w.focus()
    setTimeout(() => console.log('COVER ' + w.getMediaSourceId().split(':')[1]), 800)
  })
  w.loadURL('data:text/html,<title>E2E cover</title>cover')
})
