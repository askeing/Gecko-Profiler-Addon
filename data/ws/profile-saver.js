/**
 * Created by Askeing on 2017/2/24.
 */
"use strict";

function waitForElementToDisplay(selector, time, f_cb) {
    if (document.querySelector(selector) != null) {
        // The selector is displayed.
        f_cb();
        return;
    }
    else {
        setTimeout(function() {
            waitForElementToDisplay(selector, time, f_cb);
        }, time);
    }
}

function clickSaveFileBtnForDownloadLink(local_path) {
    var downloadBtn = document.querySelector(".profileSharingProfileDownloadButton > div > input");
    downloadBtn.click();

    // wait for 5 seconds, and then get links
    setTimeout(function () {
        var downloadLinks = document.querySelectorAll(".profileSharingDownloadLink");
        if(downloadLinks.length >= 2) {
            var secondDownloadLinks = downloadLinks[1];
            var secondDownloadObjectURL = secondDownloadLinks.href;
            // Downloading secondDownloadObjectURL (gz)
            // The path is platform-specific, so Python controller will handle the os.sep.
            downloadObject(secondDownloadObjectURL, local_path + 'FirefoxProfile.json.gz');
        } else if (downloadLinks.length == 1) {
            var firstDownloadLinks = downloadLinks[0];
            var firstDownloadObjectURL = firstDownloadLinks.href;
            // Downloading firstDownloadObjectURL (json)
            // The path is platform-specific, so Python controller will handle the os.sep.
            downloadObject(firstDownloadObjectURL, local_path + 'FirefoxProfile.json');
        }
    }, 5000);
}

function downloadObject(downloadObjectURL, filename) {
    // Downloading downloadObjectURL
    var xhr = new XMLHttpRequest();
    xhr.open('GET', downloadObjectURL, true);
    xhr.responseType = 'blob';
    xhr.onload = function(e) {
        if (this.status == 200) {
            var myBlob = this.response;
            var reader = new FileReader();
            reader.onload = function () {
                // Return Blob Binary String Result
                var ret_object = new Object();
                ret_object.result = reader.result;
                ret_object.filename = filename;
                self.port.emit("getfileReply", JSON.stringify(ret_object));
            };
            reader.onerror = function (evt) {
                var message = 'An error occurred reading ' + downloadObjectURL + '. ';
                switch(evt.target.error.code) {
                    case evt.target.error.NOT_FOUND_ERR:
                        message += 'File Not Found!';
                        break;
                    case evt.target.error.NOT_READABLE_ERR:
                        message += 'File is not readable.';
                        break;
                    case evt.target.error.ABORT_ERR:
                        message += 'File reading abort.';
                        break;
                };
                self.port.emit("getfileReplyFail", message);
            };
            reader.readAsBinaryString(myBlob);
        }
    };
    xhr.send();
}

function clickShareBtnForLink() {
    document.querySelector('.filterNavigatorBarItemContent').click();
    var shareBtn = document.querySelector("div.profileSharing .profileSharingShareButtonButton");
    shareBtn.click();
    setTimeout(function () {
        var shareOkBtn = document.querySelector("div.profileSharing .arrowPanelOkButton");
        shareOkBtn.click();
        setTimeout(function () {
            // Wait for Sharing Permalink ...
            var permalink = ".profileSharingPermalinkTextField";
            waitForElementToDisplay(permalink, 1000,
                function () {
                    // Wait for Sharing Permalink completed
                    var shareLinkInput = document.querySelector(".profileSharingPermalinkTextField");
                    var shareLink = shareLinkInput.value;
                    self.port.emit("getlinkReply", shareLink);
                }
            );
        }, 5000);
    }, 1000)
}

var retryCounter_ShareFinish = 60;
function waitForShareFinish() {
    var permalinkBtnSelector = ".profileSharingPermalinkButtonButton";
    var permalinkBtn = document.querySelector(permalinkBtnSelector);
    if (permalinkBtn.value == "Permalink") {
        // The sharing is finished.
        self.port.emit("waitlinkfinishReply");
        return;
    } else if (retryCounter_ShareFinish < 0) {
        self.port.emit("waitlinkfinishReplyFail");
        return;
    } else {
        retryCounter_ShareFinish -= 1;
        setTimeout(function() {
            waitForShareFinish();
        }, 5000);
    }
}

self.port.on("getfile", function (local_path) {
    clickSaveFileBtnForDownloadLink(local_path);
});

self.port.on("getlink", function () {
    clickShareBtnForLink();
});

self.port.on("waitlinkfinish", function () {
    waitForShareFinish();
});

// Wait for symbol tables ...
var hidden_status_bar = '.symbolicationStatusOverlay.hidden';
console.log("Open profiling page, and wait for loading symbol table ...");
waitForElementToDisplay(hidden_status_bar, 1000,
    function () {
        // Wait for symbol tables complete!
        self.port.emit("startReply");
    }
);