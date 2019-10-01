/*!
 * AriaNg GUI
 * 
 * Copyright (c) 2018-2019 Xmader
 * Released under the MIT license
 * 
 * Source Code: https://github.com/Xmader/aria-ng-gui
 * 
*/

const os = require("os")
const path = require("path")
const fs = require("fs")
const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron")

const edit_conf = require("./edit_conf.js")
const { buildMenu } = require("./menu.js")
const { displayTray, destroyTray } = require("./tray.js")

let mainWindow = null

const icon = path.join(__dirname, "assets", "AriaNg.png")
const trayIcon = path.join(__dirname, "assets", "tray-icon.png")

const moveFileSync = (src, dest) => {
    // fs.rename() 不能跨驱动器移动文件
    fs.copyFileSync(src, dest)
    fs.unlinkSync(src)
}

const moveConfigFileSync = (src, dest) => {
    // 优雅升级，迁移旧版本的配置文件
    if (fs.existsSync(src)) {
        if (!fs.existsSync(dest)) {
            moveFileSync(src, dest)
        } else {
            fs.unlinkSync(src)
        }
    }
}

app.commandLine.appendSwitch("ignore-certificate-errors") // 忽略证书相关错误, 适用于使用自签名证书将Aria2的RPC配置成HTTPS协议的情况

app.on("window-all-closed", () => {
    app.quit()
})

app.on("ready", () => {

    // 只允许运行单一实例 (进程)
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
        return app.quit()
    }

    mainWindow = new BrowserWindow({
        title: "AriaNg",
        width: 1000,
        height: 600,
        minWidth: 400,
        minHeight: 400,
        icon,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, "pre.js")
        }
    })

    const platform = os.platform()

    const aria2_bin = (platform == "linux" || platform == "darwin") ? "aria2c" : "aria2c.exe"
    const aria2_dir = path.join(__dirname, "aria2", platform, aria2_bin)

    const base_path_old = path.join(__dirname, "aria2")
    const conf_path_old = path.join(base_path_old, "aria2.conf")
    const session_path_old = path.join(base_path_old, "aria2.session")

    const base_path = app.getPath("userData")
    const conf_path = path.join(base_path, "aria2.conf")
    const session_path = path.join(base_path, "aria2.session")

    // 优雅升级，迁移旧版本的配置文件
    moveConfigFileSync(conf_path_old, conf_path)
    moveConfigFileSync(session_path_old, session_path)

    edit_conf(conf_path) // 根据用户的操作系统动态编辑aria2的配置文件

    //打开主程序
    fs.chmodSync(aria2_dir, 0o777)

    let aria2c = null

    function runAria2() {
        killAria2()

        aria2c = require("child_process").spawn(aria2_dir, [`--conf-path=${conf_path}`], {
            stdio: "pipe"
        })
        aria2c.stdout.pipe(process.stdout, { end: false })
        aria2c.stderr.pipe(process.stderr, { end: false })

        aria2c.on("error", runAria2)
        aria2c.on("exit", runAria2)
    }

    function killAria2() {
        if (aria2c) {
            aria2c.removeAllListeners("error")
            aria2c.removeAllListeners("exit")
            aria2c.kill("SIGINT")
            aria2c = null
        }
    }

    runAria2()

    // 打开窗口的调试工具
    //mainWindow.webContents.openDevTools()

    const locale = app.getLocale().includes("zh") ? "zh-CN" : "en-US"
    const { contextMenu, appMenu } = buildMenu(locale)

    if (platform == "darwin") {
        Menu.setApplicationMenu(appMenu)
    } else {
        mainWindow.setMenu(null)
    }

    mainWindow.loadURL(`file://${__dirname}/pages/index.html`)

    mainWindow.once("ready-to-show", () => {
        mainWindow.show()
    })

    mainWindow.on("close", (e) => {
        e.preventDefault()
        mainWindow.hide()
        displayTray(icon, trayIcon)
    })

    const onClosed = () => {
        killAria2()
        mainWindow = null
    }

    mainWindow.on("closed", onClosed)
    process.on("SIGINT", onClosed)
    process.on("SIGTERM", onClosed)

    ipcMain.on("right_btn", () => {
        contextMenu.popup(mainWindow)
    })
})

app.on("second-instance", () => {
    destroyTray()
    if (mainWindow) {
        mainWindow.focus()
        shell.beep()
    }
})

ipcMain.on("show_progress_bar", (event, n) => {
    if (mainWindow && mainWindow.setProgressBar) {
        mainWindow.setProgressBar(n ? n : -1)
    }
})
