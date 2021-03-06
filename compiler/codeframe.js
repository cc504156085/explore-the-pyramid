const range = 2;

/* => 生成代码框架 */
export function generateCodeFrame(source: string, start: number = 0, end: number = source.length): string {
  const lines = source.split(/\r?\n/);
  let count = 0;
  const res = [];

  for (let i = 0; i < lines.length; i++) {
    count += lines[i].length + 1;
    if (count >= start) {
      for (let j = i - range; j <= i + range || end > count; j++) {
        if (j < 0 || j >= lines.length) continue;

        res.push(`${ j + 1 }${ repeat(` `, 3 - String(j + 1).length) }|  ${ lines[j] }`);
        const lineLength = lines[j].length;

        if (j === i) {
          // => push 竖线
          const pad = start - (count - lineLength) + 1;
          const length = end > count ? lineLength - pad : end - start;
          res.push(`   |  ` + repeat(` `, pad) + repeat(`^`, length));
        } else if (j > i) {
          if (end > count) {
            const length = Math.min(end - count, lineLength);
            res.push(`   |  ` + repeat(`^`, length));
          }
          count += lineLength + 1;
        }
      }

      break;
    }
  }

  return res.join('\n');
}

function repeat(str, n) {
  let result = '';

  if (n > 0) {
    while (true) {
      if (n & 1) result += str;

      n >>>= 1;

      if (n <= 0) break;

      str += str;
    }
  }

  return result;
}
