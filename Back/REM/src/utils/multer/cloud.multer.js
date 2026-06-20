import multer from "multer";

export const fileValidations = {
  image: ["image/jpeg", "image/png", "image/gif", "image/jpg", "image/webp"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  video: ["video/mp4", "video/mpeg", "video/quicktime"],
  // Browser MediaRecorder emits webm/ogg (Opus); native recorders emit
  // mp3/wav/m4a. Accept all so voice messages work cross-browser.
  audio: [
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
  ],
  // Archives — zip + common variants browsers/OSes report.
  archive: [
    "application/zip",
    "application/x-zip-compressed",
    "application/x-zip",
    "multipart/x-zip",
  ],
};

export const uploadCloudFile = (fileValidation = []) => {
  const storage = multer.diskStorage({});

  function fileFilter(req, file, cb) {
    if (fileValidation.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // 400 (client error) — not a 500. Flag exposes the message to the
      // client via the global error handler's explicit-4xx branch.
      const err = new Error(
        `Invalid file type "${file.mimetype}". Allowed types: ${fileValidation.join(", ")}`,
      );
      err.statusCode = 400;
      err.expose = true;
      cb(err, false);
    }
  }

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
  });
};
