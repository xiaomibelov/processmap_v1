function isFile(value) {
  return typeof File === "function" && value instanceof File;
}

export function getFirstPickedFile(eventLike) {
  const files = eventLike?.target?.files;
  if (!files) return null;
  if (isFile(files[0])) return files[0];
  if (typeof files.item === "function") {
    const first = files.item(0);
    if (isFile(first)) return first;
  }
  if (typeof files[Symbol.iterator] === "function") {
    for (const file of files) {
      if (isFile(file)) return file;
    }
  }
  return null;
}
