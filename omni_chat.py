import json
import urllib.request

API_URL = "http://localhost:20128/v1/chat/completions"
API_KEY = "sk-66faae1791e771e2-c829a0-4d2f69b7"

def ask_omni(prompt):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    data = {
        "model": "Free-Combo",
        "messages": [{"role": "user", "content": prompt}]
    }
    req = urllib.request.Request(API_URL, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"خطأ في الاتصال بالسيرفر المحلي: {e}"

if __name__ == "__main__":
    print("=== شات OmniRoute المحلي جاهز (اكتب 'exit' للخروج) ===")
    while True:
        user_input = input("\nأنت: ")
        if user_input.lower() in ["exit", "خروج"]:
            break
        print("\nالذكاء الاصطناعي جاري الرد...")
        answer = ask_omni(user_input)
        print(f"\nالرد:\n{answer}")