import { test } from 'node:test'
import assert from 'node:assert/strict'
import { x11Relaunch } from '../src/main/platform.ts'

const wayland = { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }
const argv = ['/opt/app/cassette-player-retro', '--foo']

test('x11Relaunch: Linux Wayland with XWayland relaunches with the X11 flag', () => {
  assert.deepEqual(x11Relaunch('linux', wayland, argv, '/opt/app/cassette-player-retro'), {
    execPath: '/opt/app/cassette-player-retro',
    args: ['--foo', '--ozone-platform=x11']
  })
})

test('x11Relaunch: an AppImage relaunches the AppImage file, not its temporary mount', () => {
  assert.equal(x11Relaunch('linux', { ...wayland, APPIMAGE: '/home/u/App.AppImage' }, argv, '/tmp/.mount_x/app')?.execPath, '/home/u/App.AppImage')
})

test('x11Relaunch: no relaunch when not needed or not possible', () => {
  assert.equal(x11Relaunch('darwin', wayland, argv, 'x'), null)
  assert.equal(x11Relaunch('win32', wayland, argv, 'x'), null)
  assert.equal(x11Relaunch('linux', { DISPLAY: ':0' }, argv, 'x'), null) // X11 session already
  assert.equal(x11Relaunch('linux', { WAYLAND_DISPLAY: 'wayland-0' }, argv, 'x'), null) // no XWayland
  assert.equal(x11Relaunch('linux', wayland, [...argv, '--ozone-platform=wayland'], 'x'), null) // user chose
  assert.equal(x11Relaunch('linux', wayland, [...argv, '--ozone-platform=x11'], 'x'), null) // already relaunched
})
