import {ActionComplete, DownloadProgress} from "./Progress";

import * as fs from 'fs';


export class Downloader {
    static async downloadFile(from: string, to: string, onProgress: DownloadProgress = () => {}, onComplete: ActionComplete = () => {}) {
        const response = await fetch(from);
        if (!response.ok) {
            throw new Error('Download error.');
        }

        const inStream = response.body;
        const maxLength = parseInt(response.headers.get('Content-Length') || '0', 10);
        if (inStream) {
            const stream = inStream.getReader();
            const outStream = fs.createWriteStream(to);

            let downloadProgress = 0;
            try {
                let finished = false;
                while (!finished) {
                    const {done, value} = await stream.read();
                    if (done) {
                        finished = done;
                        break;
                    }
                    downloadProgress += value.length;
                    onProgress(downloadProgress, maxLength);
                    if (outStream) {
                        outStream.write(value);
                    }
                }
            } finally {
                stream.releaseLock();
                onComplete(true);
                outStream.close();
            }
        }
    }
}