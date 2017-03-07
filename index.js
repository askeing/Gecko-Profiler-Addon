const self = require('sdk/self');
const asyncStorage = require("lib/async-storage");
const profiler = require("lib/profiler");
const symbolStore = require("lib/symbol-store");
const { Hotkey } = require("sdk/hotkeys");
const tabs = require("sdk/tabs");
const { viewFor } = require("sdk/view/core");
const { getBrowserForTab } = require("sdk/tabs/utils");
const { prefs } = require("sdk/simple-prefs");
const { ToggleButton } = require('sdk/ui/button/toggle');
const { Panel } = require("sdk/panel");
const fxprefs = require("sdk/preferences/service");
const pageWorkers = require("sdk/page-worker");
const pageMod = require("sdk/page-mod");

// a dummy function, to show how tests work.
// to see how to test this function, look at test/test-index.js
function dummy(text, callback) {
  asyncStorage.setItem("dummytext", text).then(() => {
    return asyncStorage.getItem("dummytext");
  }).then(callback);
}

function getNSSSymbols() {
  return profiler.getSharedLibraryInformation().then(libs => {
        let loadedNSSLibs = libs.filter(lib => {
              return lib.pdbName.toLowerCase().startsWith("libnss3");
});
  return Promise.all(loadedNSSLibs.map(lib => {
        return symbolStore.getSymbols(lib.pdbName, lib.breakpadId, lib.name,
            profiler.platform.platform,
            profiler.platform.arch);
}));
});
}

let settings = {
  buffersize: 1000000,
  interval: 1,
  features: {
    js: true,
    stackwalk: true,
    tasktracer: false,
  },
  threads: "GeckoMain,Compositor",
};

function readPrefs() {
  settings.buffersize = fxprefs.get("profiler.entries", 1000000);
  settings.interval = +fxprefs.get("profiler.intervalMs", "1");
  settings.threads = fxprefs.get("profiler.threadfilter", "GeckoMain,Compositor");
  settings.features.js = fxprefs.get("profiler.js", true);
  settings.features.stackwalk = fxprefs.get("profiler.stackwalk", true);
  settings.features.tasktracer = fxprefs.get("profiler.tasktracer", false);
}

function setPrefs() {
  fxprefs.set("profiler.version", 9);
  fxprefs.set("profiler.entries", settings.buffersize);
  fxprefs.set("profiler.intervalMs", `${settings.interval}`);
  fxprefs.set("profiler.threadfilter", settings.threads);
  fxprefs.set("profiler.js", settings.features.js);
  fxprefs.set("profiler.stackwalk", settings.features.stackwalk);
  fxprefs.set("profiler.tasktracer", settings.features.tasktracer);
}

function startProfiler() {
  readPrefs();
  const threads = settings.threads.split(",");
  const enabledFeatures = Object.keys(settings.features).filter(f => settings.features[f]);
  enabledFeatures.push("leaf");
  if (threads.length > 0) {
    enabledFeatures.push("threads");
  }
  profiler.start(settings.buffersize, settings.interval,
      enabledFeatures, threads);
}

function toggleProfilerStartStop() {
  profiler.isRunning().then(running => {
    if (running) {
      profiler.stop();
    } else {
      startProfiler();
    }
  })
}

const panel = Panel({
      width: 330,
      height: 168 + 2,
      contentURL: self.data.url('panel.html'),
      contentScriptFile: self.data.url('panel.js'),
      onHide: () => {
        try {
          button.state('window', { checked: false });
        } catch (e) {}
      },
});

const button = ToggleButton({
      id: 'gecko-profiler',
      label: 'Gecko Profiler',
      icon: self.data.url('img/toolbar_off.png'),
      onChange: (state) => {
        if (state.checked) {
          readPrefs();
          panel.port.emit('ProfilerStateUpdated', settings);
          panel.port.emit('ProfilerStateUpdated', { settingsOpen: false });
          panel.resize(panel.width, 168 + 2);
          panel.show({ position: button });
        }
      },
});

profiler.addIsRunningObserver(isRunning => {
  button.icon = isRunning ? self.data.url('img/toolbar_on.png') : self.data.url('img/toolbar_off.png');
  panel.port.emit('ProfilerStateUpdated', { isRunning });
});

panel.port.on('ProfilerControlEvent', e => {
  switch (e.type) {
    case 'StartProfiler':
      startProfiler();
      break;
    case 'StopProfiler':
      profiler.stop();
      break;
    case 'CaptureProfile':
      panel.hide();
      collectProfile();
      break;
    case 'PanelHeightUpdated':
      panel.resize(panel.width, e.height + 2);
      break;
    case 'ChangeSetting': {
      const changedSettings = Object.assign({}, e);
      delete changedSettings.type;
      Object.assign(settings, changedSettings);
      setPrefs();
      break;
    }
    case 'ChangeFeature': {
      const changedFeatures = Object.assign({}, e);
      delete changedFeatures.type;
      Object.assign(settings.features, changedFeatures);
      setPrefs();
      break;
    }
    default:
  }
});

function makeProfileAvailableToTab(profile, tab) {
  const browser = getBrowserForTab(viewFor(tab));
  const mm = browser.messageManager;
  mm.loadFrameScript(self.data.url('tab-framescript.js'), true);
  mm.sendAsyncMessage("GeckoProfilerAddon:Init", profile);
  mm.addMessageListener('GeckoProfilerAddon:GetSymbolTable', e => {
    const { pdbName, breakpadId } = e.data;
  symbolStore.getSymbols(pdbName, breakpadId).then(result => {
    const [addr, index, buffer] = result;
  mm.sendAsyncMessage('GeckoProfilerAddon:GetSymbolTableReply', {
    status: 'success',
    pdbName, breakpadId, result: [addr, index, buffer]
  });
}, error => {
    mm.sendAsyncMessage('GeckoProfilerAddon:GetSymbolTableReply', {
      status: 'error',
      pdbName, breakpadId,
      error: `${error}`,
    });
  })
});
}

function collectProfile() {
  // Pause profiler before we collect the profile, so that we don't capture
  // more samples while the parent process waits for subprocess profiles.
  profiler.pause();

  var profilePromise = profiler.getProfile();
  var tabOpenPromise = new Promise((resolve, reject) => {
        tabs.open({
        url: prefs.reportUrl,
        onReady: resolve
      });
});
  var symbolStorePrimingPromise =
      profiler.getSharedLibraryInformation().then(sli => symbolStore.prime(sli, profiler.platform));

  Promise.all([profilePromise, tabOpenPromise, symbolStorePrimingPromise]).then(function ([profile, tab]) {
    makeProfileAvailableToTab(profile, tab);
  }).catch(error => {
    console.log("error getting profile:");
  console.log(error)
  tabOpenPromise.then(tab => tab.url = `data:text/html,${error}`);
}).then(function () {
    // Resume the profiler after profiler page is opened.
    if (profiler.isRunning()) {
      profiler.resume();
    }
  });
}

let startStopHotKey = Hotkey({
  combo: "control-shift-1",
  onPress: toggleProfilerStartStop
});

let collectHotKey = Hotkey({
  combo: "control-shift-2",
  onPress: collectProfile
});

function writeBinaryDataToFile(data, filename) {
  // Saving file ...
  try {
    var fileIO = require("sdk/io/file");
    var ByteWriter = fileIO.open(filename, "wb");
    if (!ByteWriter.closed) {
      ByteWriter.write(data);
      ByteWriter.close();
      return true;
    }
  } catch (e) {
    console.log("Write to " + filename + " failed.");
    return false;
  }
}

var profiling_page_opened = false;

function startProfilingForRemoteCall(enableStartReply) {

  perf_pmod = pageMod.PageMod({
    include: "https://perf-html.io/from-addon/*",
    contentScriptWhen: "end",
    contentScriptFile: self.data.url("ws/profile-saver.js"),
    onAttach: function(worker) {
      // opening profiling page, and reply okay after finished
      worker.port.on("startReply", function () {
        profiling_page_opened = true;
        if (enableStartReply) {
          ws_worker.port.emit("reply", 'okay');
        }
      });
      // getting the profiling file, and reply file path
      worker.port.on("getfileReply", function (ret_message) {
        var ret_object = JSON.parse(ret_message);
        var data = ret_object.result;
        var filename = ret_object.filename;
        var is_success = writeBinaryDataToFile(data, filename);
        if (is_success) {
          ws_worker.port.emit("reply", filename);
        } else {
          ws_worker.port.emit("replyfail", "Write to file failed: " + filename);
        }
      });
      // getting the profiling file failed.
      worker.port.on("getfileReplyFail", function (error_message) {
        ws_worker.port.emit("replyfail", "Reading Blob file failed: " + error_message);
      });
      // getting the profiling link, and reply link
      worker.port.on("getlinkReply", function (shareLink) {
        ws_worker.port.emit("reply", shareLink);
      });
    }
  });

  collectProfile();
}

ws_worker = pageWorkers.Page({
  contentScriptFile: self.data.url("ws/client.js"),
  contentURL: self.data.url("ws/client.html"),
  onMessage: function(ret_message) {
    // Add-on Script Get the message from ws/client.js
    ret_object = JSON.parse(ret_message);
    console.log("Get Command: " + ret_object.command);
    // message will has two part, command and data.
    if (ret_object.command == 'start') {
      if (profiling_page_opened) {
        // already open profiling page
        ws_worker.port.emit("reply", 'okay');
      } else {
        // opening profiling page
        startProfilingForRemoteCall(true);
      }
    } else if (ret_object.command == 'getfile') {
      if (!profiling_page_opened) {
        // not open profiling page, open it first
        startProfilingForRemoteCall(false);
      }
      // getting the profiling file
      var local_path = ret_object.data;
      perf_pmod.port.emit("getfile", local_path);
    } else if (ret_object.command == 'getlink') {
      if (!profiling_page_opened) {
        // not open profiling page, open it first
        startProfilingForRemoteCall(false);
      }
      // getting the profiling link
      perf_pmod.port.emit("getlink");
    }
  }
});


function main(options, callbacks) {
  readPrefs();
  setPrefs();
  startProfiler();
}

exports.getNSSSymbols = getNSSSymbols;
exports.main = main;
exports.dummy = dummy;
