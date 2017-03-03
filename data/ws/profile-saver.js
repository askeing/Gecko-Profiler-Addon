/**
 * Created by Askeing on 2017/2/24.
 */
"use strict";

function waitForElementToDisplay(selector, time, f_cb) {
    if(document.querySelector(selector)!=null) {
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
    var downloadBtnDiv = document.getElementsByClassName("profileSharingProfileDownloadButton")[0];
    var downloadBtn = downloadBtnDiv.childNodes[0].childNodes[0];
    downloadBtn.click();

    // wait for 5 seconds, and then get links
    setTimeout(function () {
        var downloadLinks = document.getElementsByClassName("profileSharingDownloadLink");
        if(downloadLinks.length >= 2) {
            var secondDownloadLinks = downloadLinks[1];
            var secondDownloadObjectURL = secondDownloadLinks.href;
            // Downloading secondDownloadObjectURL (gz)
            downloadObject(secondDownloadObjectURL, local_path + '/FirefoxProfile.json.gz');
        } else if (downloadLinks.length == 1) {
            var firstDownloadLinks = downloadLinks[0];
            var firstDownloadObjectURL = firstDownloadLinks.href;
            // Downloading firstDownloadObjectURL (json)
            downloadObject(firstDownloadObjectURL, local_path + '/FirefoxProfile.json');
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
            reader.onloadend = function () {
                // Return Blob Binary String Result
                var ret_object = new Object();
                ret_object.result = reader.result;
                ret_object.filename = filename;
                self.port.emit("getfileReply", ret_object);
            };
            reader.readAsBinaryString(myBlob);
        }
    };
    xhr.send();
}

function clickShareBtnForLink() {
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

self.port.on("getfile", function (local_path) {
    clickSaveFileBtnForDownloadLink(local_path);
});

self.port.on("getlink", function () {
    clickShareBtnForLink();
});

// Wait for symbol tables ...
var hidden_status_bar = '.symbolicationStatusOverlay.hidden';
waitForElementToDisplay(hidden_status_bar, 1000,
    function () {
        // Wait for symbol tables complete!
        self.port.emit("startReply");
    }
);