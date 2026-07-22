import re

with open('renderer.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = "{ key: 'smirk', emoji: '\U0001f60f', aliases: ['sly'] }\n];"
new = "{ key: 'smirk', emoji: '\U0001f60f', aliases: ['sly'] },\n  { key: 'v', emoji: '\u270c\ufe0f', aliases: ['victory', 'peace', 'v_sign'] }\n];"

if old in content:
    content = content.replace(old, new, 1)
    with open('renderer.js', 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print('ADDED: :v: shortcode for victory hand')
else:
    print('NOT FOUND')
    idx = content.find('smirk')
    if idx != -1:
        print(repr(content[idx:idx+80]))
