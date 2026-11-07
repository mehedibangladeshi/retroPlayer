// Another app for the dock E2E: one plain window at x y width height (argv), in front. Prints its window id.
const { app, BrowserWindow } = require('electron')
const [x, y, width, height] = process.argv.slice(-4).map(Number)
app.whenReady().then(() => {
  const w = new BrowserWindow({ x, y, width, height, show: false })
  w.once('ready-to-show', () => {
    w.show()
    app.focus({ steal: true })
    w.focus()
    setTimeout(() => console.log('COVER ' + w.getMediaSourceId().split(':')[1]), 800)
  })
  w.loadURL('data:text/html,cover')
})
