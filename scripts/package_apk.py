import os
import sys
import shutil
import zipfile
import urllib.request
import json
import subprocess
import tempfile

def log(msg):
    print(f"[APK-BUILDER] {msg}", flush=True)

def fetch_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def main():
    base_apk = r"C:\Users\Khaled.Mahmoud\Downloads\APK\Mydan-debug-20261013.apk"
    if not os.path.exists(base_apk):
        raise FileNotFoundError(f"Base APK not found at {base_apk}")

    sdk_build_tools = r"C:\Users\Khaled.Mahmoud\AppData\Local\Android\Sdk\build-tools\34.0.0"
    zipalign_bin = os.path.join(sdk_build_tools, "zipalign.exe")
    apksigner_bin = os.path.join(sdk_build_tools, "apksigner.bat")
    jdk_dir = r"C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
    keystore_path = r"C:\Users\Khaled.Mahmoud\.android\debug.keystore"

    for required_file in [zipalign_bin, apksigner_bin, keystore_path]:
        if not os.path.exists(required_file):
            raise FileNotFoundError(f"Required tool or keystore missing: {required_file}")

    local_dist = os.path.abspath(r"artifacts\mydan\dist\public")
    local_manifest = os.path.join(local_dist, "asset-manifest.json")

    downloaded_assets = {}
    if os.path.exists(local_manifest):
        log(f"1. Using fresh local build from: {local_dist}...")
        with open(local_manifest, "rb") as f:
            manifest_raw = f.read()
        manifest = json.loads(manifest_raw.decode("utf-8"))
        log(f"   Manifest version: {manifest.get('version')} with {len(manifest.get('assets', []))} assets")

        log("2. Using local SPA index.html...")
        with open(os.path.join(local_dist, "index.html"), "rb") as f:
            spa_index_html = f.read()
        if b'<div id="root">' not in spa_index_html:
            raise ValueError("Local index.html missing root div!")
        log("   SPA index.html verified successfully.")

        log("3. Reading local build assets...")
        for asset_rel in manifest.get("assets", []):
            asset_path = os.path.join(local_dist, asset_rel.replace("/", os.sep))
            with open(asset_path, "rb") as f:
                downloaded_assets[asset_rel] = f.read()
        log(f"   Loaded {len(downloaded_assets)} local build assets successfully.")
    else:
        log("1. Fetching latest asset manifest from Cloudflare Pages...")
        manifest_raw = fetch_url("https://mydan.digityoucan.com/asset-manifest.json")
        manifest = json.loads(manifest_raw.decode("utf-8"))
        log(f"   Manifest version: {manifest.get('version')} with {len(manifest.get('assets', []))} assets")

        log("2. Fetching SPA index.html from Cloudflare Pages...")
        spa_index_html = fetch_url("https://mydan.digityoucan.com/login")
        if b'<div id="root">' not in spa_index_html or b'assets/index-' not in spa_index_html:
            raise ValueError("Fetched SPA index.html does not contain root div or main index bundle script tag!")
        log("   SPA index.html verified successfully.")

        log("3. Downloading all latest build assets...")
        for asset_rel in manifest.get("assets", []):
            url = f"https://mydan.digityoucan.com/{asset_rel}"
            log(f"   Fetching {asset_rel}...")
            content = fetch_url(url)
            downloaded_assets[asset_rel] = content

        log(f"   Downloaded {len(downloaded_assets)} web assets successfully.")

    temp_work_dir = tempfile.mkdtemp(prefix="mydan_apk_")
    try:
        temp_unaligned_apk = os.path.join(temp_work_dir, "unaligned.apk")
        temp_aligned_apk = os.path.join(temp_work_dir, "aligned.apk")
        temp_signed_apk = os.path.join(temp_work_dir, "signed.apk")

        log("4. Repackaging APK with updated assets and clean structure...")
        with zipfile.ZipFile(base_apk, "r") as src_zip:
            with zipfile.ZipFile(temp_unaligned_apk, "w") as dst_zip:
                for item in src_zip.infolist():
                    name = item.filename
                    # Skip old signature files
                    if name.startswith("META-INF/") and (name.endswith(".SF") or name.endswith(".RSA") or name.endswith(".DSA") or name == "META-INF/MANIFEST.MF"):
                        continue
                    # Skip old assets/public/assets/*
                    if name.startswith("assets/public/assets/"):
                        continue
                    # Skip old assets/public/index.html and asset-manifest.json
                    if name in ["assets/public/index.html", "assets/public/asset-manifest.json"]:
                        continue

                    # Copy existing file preserving exact compression type
                    data = src_zip.read(name)
                    new_info = zipfile.ZipInfo(name)
                    new_info.compress_type = item.compress_type
                    new_info.date_time = (2026, 10, 14, 12, 0, 0)
                    dst_zip.writestr(new_info, data)

                # Write fresh assets/public/index.html
                index_info = zipfile.ZipInfo("assets/public/index.html")
                index_info.compress_type = zipfile.ZIP_DEFLATED
                index_info.date_time = (2026, 10, 14, 12, 0, 0)
                dst_zip.writestr(index_info, spa_index_html)

                # Write fresh assets/public/asset-manifest.json
                manifest_info = zipfile.ZipInfo("assets/public/asset-manifest.json")
                manifest_info.compress_type = zipfile.ZIP_DEFLATED
                manifest_info.date_time = (2026, 10, 14, 12, 0, 0)
                dst_zip.writestr(manifest_info, manifest_raw)

                # Write all fresh downloaded web assets
                for asset_rel, content in downloaded_assets.items():
                    # e.g. asset_rel = "assets/index-DdLqLf6t.js" -> in APK: "assets/public/assets/index-DdLqLf6t.js"
                    apk_entry_name = f"assets/public/{asset_rel}"
                    asset_info = zipfile.ZipInfo(apk_entry_name)
                    if asset_rel.endswith(".png"):
                        asset_info.compress_type = zipfile.ZIP_STORED
                    else:
                        asset_info.compress_type = zipfile.ZIP_DEFLATED
                    asset_info.date_time = (2026, 10, 14, 12, 0, 0)
                    dst_zip.writestr(asset_info, content)

        log("5. Running zipalign (4-byte alignment)...")
        zipalign_cmd = [zipalign_bin, "-f", "-p", "4", temp_unaligned_apk, temp_aligned_apk]
        res = subprocess.run(zipalign_cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"zipalign failed: {res.stderr}\n{res.stdout}")
        log("   zipalign completed successfully.")

        log("6. Signing APK using apksigner with debug.keystore (v1 and v2 schemes)...")
        apksigner_cmd = [
            apksigner_bin, "sign",
            "--ks", keystore_path,
            "--ks-pass", "pass:android",
            "--ks-key-alias", "androiddebugkey",
            "--key-pass", "pass:android",
            "--v1-signing-enabled", "true",
            "--v2-signing-enabled", "true",
            "--v3-signing-enabled", "false",
            "--out", temp_signed_apk,
            temp_aligned_apk
        ]
        custom_env = os.environ.copy()
        custom_env["JAVA_HOME"] = jdk_dir
        custom_env["PATH"] = os.path.join(jdk_dir, "bin") + ";" + custom_env.get("PATH", "")

        res = subprocess.run(apksigner_cmd, capture_output=True, text=True, env=custom_env)
        if res.returncode != 0:
            raise RuntimeError(f"apksigner failed: {res.stderr}\n{res.stdout}")
        log("   apksigner signing completed successfully.")

        log("7. Verifying signed APK...")
        verify_cmd = [apksigner_bin, "verify", "--verbose", temp_signed_apk]
        res = subprocess.run(verify_cmd, capture_output=True, text=True, env=custom_env)
        if res.returncode != 0:
            raise RuntimeError(f"Verification failed: {res.stderr}\n{res.stdout}")
        log("   Verification details:\n" + "\n".join([f"     {line}" for line in res.stdout.splitlines() if "Verified" in line or "Verifies" in line]))

        # Define targets
        project_dir = os.path.abspath(".")
        project_apk_1 = os.path.join(project_dir, "Mydan-latest.apk")
        project_apk_2 = os.path.join(project_dir, "artifacts", "mydan", "dist", "Mydan-latest.apk")
        downloads_apk_1 = r"C:\Users\Khaled.Mahmoud\Downloads\APK\Mydan-latest.apk"
        downloads_apk_2 = r"C:\Users\Khaled.Mahmoud\Downloads\APK\Mydan-debug-20261017.apk"

        os.makedirs(os.path.dirname(project_apk_2), exist_ok=True)
        os.makedirs(os.path.dirname(downloads_apk_1), exist_ok=True)

        log("8. Copying final APK to designated destinations...")
        for dest in [project_apk_1, project_apk_2, downloads_apk_1, downloads_apk_2]:
            shutil.copyfile(temp_signed_apk, dest)
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            log(f"   -> Copied to: {dest} ({size_mb:.2f} MB)")

        log("SUCCESS! Latest APK generated and deployed to all requested paths.")

    finally:
        shutil.rmtree(temp_work_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
