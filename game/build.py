# Bundles index.html + rules.js + difficulty.js into one publishable file: dist/odd-one-out.html.
import re, pathlib
p = pathlib.Path(__file__).parent
html = (p/'index.html').read_text()
strip = lambda s: re.sub(r'^import .*\n', '', re.sub(r'^export ', '', s, flags=re.M), flags=re.M)
mods = strip((p/'rules.js').read_text()) + '\n' + strip((p/'difficulty.js').read_text())
html = re.sub(r"import \{[^}]*\} from '\./(rules|difficulty)\.js';\n", '', html)
html = html.replace('<script type="module">', '<script type="module">\n' + mods, 1)
html = re.sub(r'(?is)<!doctype html>|</?html[^>]*>|</?head>|</?body>', '', html)
(p/'dist/odd-one-out.html').write_text(html.strip() + '\n')
