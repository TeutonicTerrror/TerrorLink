const path = require('path');
const fs = require('fs');

let TLHook;
const nodePath = path.join(__dirname, 'build', 'Release', 'TLHook.node');
if (fs.existsSync(nodePath)) {
	TLHook = require(nodePath);
} else {
	TLHook = require('node-gyp-build')(path.join(__dirname));
}

module.exports = {
	startHook: TLHook.startHook,
	stopHook: TLHook.stopHook
};
