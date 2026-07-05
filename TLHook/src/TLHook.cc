
#include <napi.h>
#include <windows.h>
#include <atomic>

static Napi::ThreadSafeFunction tsfn;
static HHOOK hHook = NULL;
static std::atomic<bool> hookActive(false);

LRESULT CALLBACK KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && hookActive) {
        KBDLLHOOKSTRUCT* p = (KBDLLHOOKSTRUCT*)lParam;
        bool isKeyDown = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN);
        bool isKeyUp = (wParam == WM_KEYUP || wParam == WM_SYSKEYUP);
        
        if (isKeyDown || isKeyUp) {
            DWORD vkCode = p->vkCode;
            DWORD eventCode = isKeyUp ? (vkCode | 0x80000000) : vkCode;
            
            tsfn.NonBlockingCall([eventCode](Napi::Env env, Napi::Function jsCallback) {
                jsCallback.Call({ Napi::Number::New(env, eventCode) });
            });
        }
    }
    return CallNextHookEx(hHook, nCode, wParam, lParam);
}

Napi::Value StartHook(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!hookActive) {
        if (!info[0].IsFunction()) {
            Napi::TypeError::New(env, "Callback required").ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Function cb = info[0].As<Napi::Function>();
        tsfn = Napi::ThreadSafeFunction::New(env, cb, "KeyEvent", 0, 1);
        hHook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, NULL, 0);
        hookActive = hHook != NULL;
    }
    return Napi::Boolean::New(env, hookActive);
}

Napi::Value StopHook(const Napi::CallbackInfo& info) {
    if (hookActive && hHook) {
        UnhookWindowsHookEx(hHook);
        hHook = NULL;
        hookActive = false;
        tsfn.Release();
    }
    return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("startHook", Napi::Function::New(env, StartHook));
    exports.Set("stopHook", Napi::Function::New(env, StopHook));
    return exports;
}

NODE_API_MODULE(TLHook, Init)
