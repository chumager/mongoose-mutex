import gulp from "gulp";
const {src, dest, parallel, watch: w} = gulp;
import terser from "gulp-terser";
import del from "del";
import debug from "gulp-debug";
import babel from "gulp-babel";
import rename from "gulp-rename";
import path from "path";
const Path = ["src/**/*.js"];
del.sync("dist/*");
function transpile(path = Path) {
  if (typeof path === "function") path = Path;
  return src(path, {base: "src"})
    .pipe(debug())
    .pipe(
      babel({
        presets: ["@babel/env"],
        targets: {node: 16}
      })
    )
    .pipe(terser())
    .pipe(rename({extname: ".cjs"}))
    .pipe(debug())
    .pipe(dest("dist/"));
}
function watch() {
  const watcher = w(Path);
  watcher.on("change", transpile);
  watcher.on("add", transpile);
  watcher.on("unlink", filePath => {
    const filePathFromSrc = path.relative(path.resolve("src"), filePath);
    const destFilePath = path.resolve("dist", filePathFromSrc);
    console.log("Eliminando", destFilePath);
    del.sync(destFilePath);
  });
  return watcher;
}
export {watch, transpile as js};
export default parallel(transpile, watch);
