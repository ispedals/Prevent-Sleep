var {Cc, Ci, Cu} = require("chrome");

const DEBUG = false;

function log() {
	if(DEBUG) { console.log(Array.prototype.slice.call(arguments));}
} 

function Download_Listener(downloading_callback, done_callback) {
	this.onSecurityChange = function(prog, req, state, dl) { };
	this.onProgressChange = function(prog, req, prog, progMax, tProg, tProgMax, dl) { };
	this.onStateChange = function(prog, req, flags, status, dl) { };
	
	var downloading_callback = downloading_callback;
	var finish = done_callback;
	
	// This function will only be called for either global or private downloads, not both.
	// Thus, if both types of downloads are occuring, one listener's finish may not be called
	// but finish will eventually be called when the total download number is 0
	this.onDownloadStateChange = function(state, dl) {
		var download_manager = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
		var download_counts = download_manager.activeDownloadCount + download_manager.activePrivateDownloadCount;
		if (download_counts > 0) {
			log('Probably going to prevent sleep because download count is ', download_counts);
			downloading_callback();
		}
		else {
			log('Probably going to allow sleep because download count is ', download_counts);
			finish();
		}
	};
}

function sm ()  {
	
	//http://msdn.microsoft.com/en-us/library/windows/desktop/aa373208%28v=vs.85%29.aspx
	const EXECUTION_STATE = {
		ES_AWAYMODE_REQUIRED : 0x00000040,
		ES_CONTINUOUS : 0x80000000,
		ES_DISPLAY_REQUIRED : 0x00000002,
		ES_SYSTEM_REQUIRED : 0x00000001
	};
	
	var setThreadExecutionState = function (state) {
		Cu.import("resource://gre/modules/ctypes.jsm");
		var lib = ctypes.open("kernel32.dll");
		var setThreadExecutionState = lib.declare("SetThreadExecutionState", ctypes.winapi_abi, ctypes.uint32_t, ctypes.uint32_t);
		setThreadExecutionState(state);
		lib.close();
	};
	
	this.prevent_sleep=function () {
		log('preventing sleep');
		//ORing the values ourselves gives wrong results
		setThreadExecutionState(2147483715); // ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED | ES_AWAYMODE_REQUIRED
		//not requesting display causes sleep to occur anyway for some reason
		//setThreadExecutionState(137438953472); // ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
	};
	
	this.allow_sleep=function () {
		log('allowing sleep');
		setThreadExecutionState(2147483648); // ES_CONTINUOUS
	};
};

function print_idle_timer(){
	Cu.import("resource://gre/modules/ctypes.jsm");
	const DWORD = ctypes.uint32_t; //DWORD is uint32
	
	var ulib = ctypes.open("user32.dll");
	const struct_LASTINPUTINFO = new ctypes.StructType( 'PLASTINPUTINFO', [ { 'cbSize' : ctypes.unsigned_int}, { 'dwTime' : DWORD} ] ); 
	var GetLastInputInfo = ulib.declare("GetLastInputInfo", ctypes.winapi_abi, ctypes.bool, struct_LASTINPUTINFO.ptr);
	var info = struct_LASTINPUTINFO();
	info.cbSize = struct_LASTINPUTINFO.size; //info.size is returning undefined for some reason, must call size on ctype itself
	var ret = GetLastInputInfo(info.address());
	if(!ret) {
		log('calling GetLastInputInfo returned error ', ctypes.winLastError);
	}
	ulib.close();
	
	var klib = ctypes.open("kernel32.dll");
	var GetTickCount = klib.declare('GetTickCount', ctypes.winapi_abi, DWORD);
	var tick_count = GetTickCount();
	klib.close();

	log('idle tick count is ', (tick_count - info.dwTime)/1000);
}

var sleep_manager = new sm();
var listener = new Download_Listener(sleep_manager.prevent_sleep, sleep_manager.allow_sleep);
var private_listener = new Download_Listener(sleep_manager.prevent_sleep, sleep_manager.allow_sleep);
var download_manager = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
download_manager.addListener(listener);
download_manager.addPrivacyAwareListener(private_listener);

require("sdk/timers").setInterval(print_idle_timer, 1000);

require("sdk/system/unload").when(function(){
	var download_manager = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
	download_manager.removeListener(listener);
	download_manager.removeListener(private_listener);
	log('unloading, going to allow sleep');
	sleep_manager.allow_sleep();
});