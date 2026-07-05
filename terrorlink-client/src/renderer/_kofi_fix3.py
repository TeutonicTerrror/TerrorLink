import re

with open('renderer.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Read SVG and extract g-content
svg_raw = open('../../assets/images/kofi_symbol.svg', 'r', encoding='utf-8').read()
svg_raw = re.sub(r'\s+', ' ', svg_raw).strip()
g_content = svg_raw.split('<g mask=', 1)[1].split('</svg>', 1)[0]
mask_content = svg_raw.split('<mask ', 1)[1].split('</mask>', 1)[0]

# Build card HTML using JS template literal so maskId is computed dynamically
# Use <a> with target="_blank" instead of onclick with require()

# The card uses a template literal so the maskId can be computed at runtime
card_builder = (
    "    if (lower.startsWith('/kofi')) {\n"
    "      var maskId = 'kofi-card-' + Date.now() + '-mask';\n"
    "      var card = '<div style=\"display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(255,90,22,0.08),rgba(32,32,32,0.5));' +\n"
    "        'border:1px solid rgba(255,90,22,0.35);border-radius:14px;padding:14px 16px;max-width:340px;\">' +\n"
    "        '<svg width=\"48\" height=\"38\" viewBox=\"0 0 241 194\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" style=\"flex-shrink:0;\">' +\n"
    "        '<mask id=\"' + maskId + '\" " + mask_content + "</mask>' +\n"
    "        '<g mask=\"url(#' + maskId + ')" + g_content + '</g></svg>' +\n"
    "        '<div style=\"display:flex;flex-direction:column;gap:4px;\">' +\n"
    "        '<span style=\"font-weight:700;font-size:14px;color:#FF5A16;\">Support TerrorLink</span>' +\n"
    "        '<span style=\"font-size:12px;color:var(--text-muted,#888);\">Buy the dev a coffee \\u2615</span>' +\n"
    "        '<a href=\"https://ko-fi.com/teutonic\" target=\"_blank\" style=\"font-size:11px;color:#FF5A16;text-decoration:none;margin-top:2px;font-weight:500;\">ko-fi.com/teutonic \\u2197</a>' +\n"
    "        '</div></div>';\n"
    "      addMessage({ id: 'kofi-' + Date.now(), from: '\\U0001f49f Ko-Fi', text: card, ts: Date.now() });\n"
    "      return { handled: true };\n"
    "    }"
)

# The old handler pattern
old = "    if (lower.startsWith('/kofi')) {\n      if (ws && ws.readyState === WebSocket.OPEN) {\n        ws.send(JSON.stringify({ type: 'kofi' }));\n      }\n      return { handled: true };\n    }"

# Find the old handler and nearby lines to also remove the handler that was previously replaced
# First check if the previously-replaced card handler exists
card_marker = "addMessage({ id: 'kofi-' + Date.now(), from: '\\U0001f49f Ko-Fi', text: '<div style=\"display:flex"
if card_marker in content:
    # The old card handler is in place, replace it with the improved one
    # Find the exact block
    idx = content.find("if (lower.startsWith('/kofi'))")
    if idx == -1:
        print('Cannot find /kofi handler start!')
        exit(1)
    
    # Find the next handler to get the end of the kofi block
    next_handler = content.find("if (lower.startsWith('/8ball'))", idx)
    if next_handler == -1:
        print('Cannot find /8ball handler after kofi!')
        exit(1)
    
    # Extract the old kofi block
    old_block = content[idx:next_handler]
    print(f'Old kofi block length: {len(old_block)}')
    
    # Replace
    content = content[:idx] + card_builder + "\n    " + content[next_handler:]
    print('/kofi card handler: REPLACED with dynamic mask ID')
else:
    print('Card handler marker not found, searching for kofi...')
    idx = content.find("if (lower.startsWith('/kofi'))")
    if idx != -1:
        print(f'Found kofi handler at position {idx}')
        context = content[idx:idx+200]
        print(f'Context: {repr(context[:150])}...')
    else:
        print('No /kofi handler found at all!')

with open('renderer.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('renderer.js saved')
