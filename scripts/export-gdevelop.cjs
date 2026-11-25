// Uses the exporter shipped with the installed GDevelop, without changing it.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const install = process.env.GDEVELOP_HOME || 'D:/Gdevelop/Gdevelop';
const asarPath = path.join(install, 'resources/app.asar');
const tools = path.join(root, '.tools');
fs.mkdirSync(tools, { recursive: true });
fs.writeFileSync(path.join(tools, 'package.json'), '{"type":"commonjs"}\n');

// Read the two compiler files directly from Electron's standard ASAR archive.
const fd = fs.openSync(asarPath, 'r');
const preamble = Buffer.alloc(16);
fs.readSync(fd, preamble, 0, 16, 0);
const headerBytes = Buffer.alloc(preamble.readUInt32LE(12));
fs.readSync(fd, headerBytes, 0, headerBytes.length, 16);
const header = JSON.parse(headerBytes);
for (const name of ['libGD.js', 'libGD.wasm']) {
  const entry = header.files.www.files[name];
  const bytes = Buffer.alloc(entry.size);
  fs.readSync(fd, bytes, 0, bytes.length, 8 + preamble.readUInt32LE(4) + Number(entry.offset));
  fs.writeFileSync(path.join(tools, name), bytes);
}
fs.closeSync(fd);

require(path.join(tools, 'libGD.js'))().then(gd => {
  gd.ProjectHelper.initializePlatforms();
  const project = gd.ProjectHelper.createNewGDJSProject();
  const serialized = gd.Serializer.fromJSON(fs.readFileSync('game.json', 'utf8'));
  project.unserializeFrom(serialized);
  project.setProjectFile(path.join(root, 'game.json'));
  if (project.getLayoutAt(0).getEvents().getEventsCount() !== 2) throw new Error('Scene events did not deserialize');

  const output = path.join(root, 'export');
  const safeWritePath = file => {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(root + path.sep)) throw new Error(`Exporter tried to write outside project: ${resolved}`);
    return resolved;
  };
  const fileSystem = new gd.AbstractFileSystemJS();
  Object.assign(fileSystem, {
    mkDir(dir) { fs.mkdirSync(safeWritePath(dir), { recursive: true }); return true; },
    dirExists(dir) { return fs.existsSync(dir); },
    clearDir(dir) {
      const resolved = safeWritePath(dir);
      // Only the generated export may be recursively cleared.
      if (resolved !== output && !resolved.startsWith(output + path.sep)) throw new Error(`Refusing to clear ${resolved}`);
      fs.mkdirSync(resolved, { recursive: true });
      for (const name of fs.readdirSync(resolved)) fs.rmSync(path.join(resolved, name), { recursive: true, force: true });
    },
    getTempDir() { return path.join(root, 'export', '.tmp').replaceAll('\\', '/'); },
    fileNameFrom(file) { return path.basename(file); },
    dirNameFrom(file) { return path.dirname(file).replaceAll('\\', '/'); },
    makeAbsolute(file, base) { return path.resolve(base, file).replaceAll('\\', '/'); },
    makeRelative(file, base) { return path.relative(base, file).replaceAll('\\', '/'); },
    isAbsolute(file) { return !file || path.isAbsolute(file) || /^https?:/.test(file); },
    copyFile(source, destination) {
      safeWritePath(destination);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(source, destination, { recursive: true });
      return true;
    },
    writeToFile(file, content) {
      safeWritePath(file); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return true;
    },
    readFile(file) { return fs.readFileSync(file, 'utf8'); },
    readDir(dir, extension) {
      const result = new gd.VectorString();
      if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) {
        if (!extension || name.toLowerCase().endsWith(extension.toLowerCase())) result.push_back((dir + '/' + name).replaceAll('\\', '/'));
      }
      return result;
    },
    fileExists(file) { try { return fs.statSync(file).isFile(); } catch { return false; } },
  });
  const exporter = new gd.Exporter(fileSystem, path.join(install, 'resources/GDJS').replaceAll('\\', '/'));
  const options = new gd.ExportOptions(project, output.replaceAll('\\', '/'));
  options.setTarget('html5');
  if (!exporter.exportWholePixiProject(options)) throw new Error(exporter.getLastError());
  console.log('GDevelop HTML5 export:', output);
  options.delete(); exporter.delete(); project.delete(); serialized.delete(); fileSystem.delete();
}).catch(error => { console.error(error); process.exitCode = 1; });
