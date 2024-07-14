import JSZip from 'jszip';
import { ActionComplete, ExtractProgress } from './Progress';

import * as fs from 'fs';
import * as path from 'path';

export class Extractor {
    static async extractFile(file: string, to: string, excludes: string[], onProgress: ExtractProgress = (): void => {}, onComplete: ActionComplete = (): void => {}): Promise<void> {
        if (!fs.existsSync(to)) {
            try {
                fs.mkdirSync(to);
            } catch (err) {
                console.error(err)
            }
        }


        let isSuccess = false;

        try {
            const data = await fs.promises.readFile(file);
            const zip = await JSZip.loadAsync(data);

            let extracted = 0;

            const files = Object.entries(zip.files).filter(([, file]) => {
                return !file.dir;
            });
            const allFiles = files.length;

            for await (const [filename] of files) {
                try {
                    const filePath = path.join(to, filename);
                    if (excludes.find((str) => str === filename))
                        continue;
                    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
                } catch (fileError) {
                    console.error(`Error creating dir "${filename}":`, fileError);
                }
            }

            for await (const [filename, file] of files) {
                try {
                    const fileData = await file.async('uint8array');
                    const filePath = path.join(to, filename);
                    if (excludes.find((str) => str === filename)) {
                        extracted += 1;
                        continue;
                    }
                    await fs.promises.writeFile(filePath, fileData);

                    extracted += 1;
                    onProgress(extracted, allFiles, filename);
                } catch (fileError) {
                    console.error(`Error extracting file "${filename}":`, fileError);
                }
            }

            isSuccess = (extracted === allFiles);
        } catch (error) {
            console.error('Error loading zip file:', error);
        } finally {
            onComplete(isSuccess);
        }
    }
}