package com.aao.team

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.view.Gravity
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val io = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("team", MODE_PRIVATE) }
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private lateinit var serverInput: EditText
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var content: LinearLayout
    private var token: String? = null
    private val isAdmin get() = BuildConfig.APP_ROLE == "admin"
    private val pickFile = 501
    private val presenceLoop = object : Runnable {
        override fun run() {
            if (!isAdmin && token != null) sendHeartbeat()
            handler.postDelayed(this, 30000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        token = prefs.getString("token", null)
        draw()
        if (token != null) loadDashboard()
    }

    override fun onResume() {
        super.onResume()
        handler.post(presenceLoop)
    }

    override fun onPause() {
        handler.removeCallbacks(presenceLoop)
        super.onPause()
    }

    private fun draw() {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 30, 28, 24)
            setBackgroundColor(0xFFF6F7FB.toInt())
        }
        root.addView(TextView(this).apply {
            text = "TEAM WORK\n" + if (isAdmin) "ADMIN CONSOLE" else "STAFF SPACE"
            textSize = 25f
            setTextColor(0xFF152442.toInt())
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 4, 0, 22)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        status = TextView(this).apply {
            text = "Private team workspace"
            textSize = 14f
            setTextColor(0xFF596579.toInt())
            setPadding(0, 0, 0, 18)
        }
        root.addView(status)
        serverInput = edit("Secure server URL (https://…)", prefs.getString("server", "https://team.example.com") ?: "")
        root.addView(serverInput)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (token == null) {
            emailInput = edit("Team email", "")
            passwordInput = edit("Password", "").apply { inputType = 129 }
            root.addView(emailInput)
            root.addView(passwordInput)
            root.addView(button("Sign in", 0xFFF05A28.toInt()) { login() })
        } else {
            root.addView(button("Refresh", 0xFF152442.toInt()) { loadDashboard() })
            root.addView(button("Sign out", 0xFF707A8C.toInt()) { logout() })
        }
        root.addView(content)
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun edit(hintText: String, value: String) = EditText(this).apply {
        hint = hintText
        setText(value)
        textSize = 15f
        setSingleLine(true)
        setPadding(16, 10, 16, 10)
    }

    private fun button(label: String, color: Int, action: () -> Unit) = Button(this).apply {
        text = label
        setTextColor(-1)
        setBackgroundTintList(android.content.res.ColorStateList.valueOf(color))
        setOnClickListener { action() }
    }

    private fun login() {
        val base = serverInput.text.toString().trim().trimEnd('/')
        if (!base.startsWith("https://")) {
            toast("Use a secure HTTPS server address.")
            return
        }
        prefs.edit().putString("server", base).apply()
        val payload = JSONObject().put("email", emailInput.text.toString().trim())
            .put("password", passwordInput.text.toString())
            .put("role", BuildConfig.APP_ROLE).toString().toByteArray()
        status.text = "Connecting securely…"
        io.execute {
            try {
                val body = JSONObject(String(http(base + "/api/login", "POST", payload, null), Charsets.UTF_8))
                val newToken = body.getString("token")
                if (body.getJSONObject("user").getString("role") != BuildConfig.APP_ROLE)
                    throw IllegalStateException("This account is not authorized for this app.")
                runOnUiThread {
                    token = newToken
                    prefs.edit().putString("token", newToken).apply()
                    draw()
                    loadDashboard()
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Sign in failed: " + (e.message ?: "check server") }
            }
        }
    }

    private fun loadDashboard() {
        val base = (prefs.getString("server", "") ?: "").trimEnd('/')
        val auth = token ?: return
        if (base.isBlank()) return
        status.text = "Loading team workspace…"
        content.removeAllViews()
        if (!isAdmin) {
            content.addView(button("Choose and share files", 0xFFF05A28.toInt()) {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                startActivityForResult(intent, pickFile)
            })
            content.addView(note("Only files you choose are shared with the team."))
            content.addView(note("Screen sharing, calls, and remote control are not enabled in this APK yet."))
            sendHeartbeat()
        } else {
            content.addView(note("Add a staff account"))
            val staffEmail = edit("Staff email", "")
            val staffPassword = edit("Temporary password (12+ characters)", "").apply { inputType = 129 }
            content.addView(staffEmail)
            content.addView(staffPassword)
            content.addView(button("Create staff account", 0xFFF05A28.toInt()) {
                createStaff(staffEmail.text.toString().trim(), staffPassword.text.toString())
            })
            content.addView(note("Team devices"))
            io.execute {
                try {
                    val devices = JSONArray(String(http(base + "/api/devices", "GET", null, auth), Charsets.UTF_8))
                    runOnUiThread {
                        if (devices.length() == 0) content.addView(note("No device check-ins yet."))
                        for (i in 0 until devices.length()) {
                            val item = devices.getJSONObject(i)
                            val state = if (item.optBoolean("online")) "ONLINE" else "OFFLINE"
                            content.addView(note(state + "  ·  " + item.optString("email") + "  ·  " + item.optString("label")))
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread { content.addView(note("Device list unavailable: " + e.message)) }
                }
            }
            content.addView(note("Shared team files"))
            io.execute {
                try {
                    val files = JSONArray(String(http(base + "/api/files", "GET", null, auth), Charsets.UTF_8))
                    runOnUiThread {
                        for (i in 0 until files.length()) {
                            val item = files.getJSONObject(i)
                            content.addView(button("Download  " + item.optString("name") + "  ·  " + item.optString("owner"), 0xFF243C68.toInt()) {
                                download(item.getString("id"), item.optString("name"))
                            })
                        }
                        if (files.length() == 0) content.addView(note("No team files have been shared yet."))
                    }
                } catch (e: Exception) {
                    runOnUiThread { status.text = "Could not load team files: " + e.message }
                }
            }
            content.addView(note("Live screen sessions and calls are planned for the next build."))
        }
        status.text = "Connected to the team server"
    }

    private fun createStaff(email: String, password: String) {
        if (email.isBlank() || password.length < 12) {
            toast("Enter a staff email and a temporary password of at least 12 characters.")
            return
        }
        val base = (prefs.getString("server", "") ?: "").trimEnd('/')
        val payload = JSONObject().put("email", email).put("password", password).toString().toByteArray()
        io.execute {
            try {
                http(base + "/api/staff", "POST", payload, token)
                runOnUiThread { toast("Staff account created. Share the temporary password securely.") }
            } catch (e: Exception) {
                runOnUiThread { toast("Could not create account: " + e.message) }
            }
        }
    }

    private fun sendHeartbeat() {
        val base = (prefs.getString("server", "") ?: "").trimEnd('/')
        val auth = token ?: return
        if (!base.startsWith("https://")) return
        val payload = JSONObject()
            .put("deviceId", android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID))
            .put("label", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
            .toString().toByteArray()
        io.execute {
            try { http(base + "/api/heartbeat", "POST", payload, auth) } catch (_: Exception) {}
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != pickFile || resultCode != RESULT_OK || data == null) return
        val uris = mutableListOf<Uri>()
        data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
        if (uris.isEmpty()) data.data?.let { uris.add(it) }
        uris.forEach { upload(it) }
    }

    private fun upload(uri: Uri) {
        val name = displayName(uri)
        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return
        val boundary = "TeamBoundary" + System.currentTimeMillis()
        val body = ByteArrayOutputStream().apply {
            write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + name.replace("\"", "_") + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").toByteArray())
            write(bytes)
            write(("\r\n--" + boundary + "--\r\n").toByteArray())
        }.toByteArray()
        val base = (prefs.getString("server", "") ?: "").trimEnd('/')
        status.text = "Sharing " + name + "…"
        io.execute {
            try {
                http(base + "/api/files", "POST", body, token, "multipart/form-data; boundary=" + boundary)
                runOnUiThread { status.text = "Shared: " + name; toast("File shared with your team.") }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Upload failed: " + e.message }
            }
        }
    }

    private fun displayName(uri: Uri): String {
        var result = "shared-file"
        val cursor: Cursor? = contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && it.moveToFirst()) result = it.getString(index) ?: result
        }
        return result
    }

    private fun download(id: String, name: String) {
        val base = (prefs.getString("server", "") ?: "").trimEnd('/')
        io.execute {
            try {
                val bytes = http(base + "/api/files/" + id + "/download", "GET", null, token)
                val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val file = java.io.File(getExternalFilesDir(null)!!, safe)
                file.writeBytes(bytes)
                runOnUiThread { toast("Saved in app storage: " + file.name) }
            } catch (e: Exception) {
                runOnUiThread { toast("Download failed: " + e.message) }
            }
        }
    }

    private fun http(url: String, method: String, body: ByteArray?, auth: String?, contentType: String = "application/json"): ByteArray {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 12000
        conn.readTimeout = 30000
        auth?.let { conn.setRequestProperty("Authorization", "Bearer " + it) }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", contentType)
            conn.outputStream.use { it.write(body) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val bytes = stream.use { it.readBytes() }
        conn.disconnect()
        if (code !in 200..299) throw IllegalStateException(String(bytes, Charsets.UTF_8).take(200))
        return bytes
    }

    private fun note(value: String) = TextView(this).apply {
        text = value; textSize = 14f; setTextColor(0xFF596579.toInt()); setPadding(8, 12, 8, 12)
    }

    private fun logout() {
        prefs.edit().remove("token").apply()
        token = null
        draw()
    }

    private fun toast(message: String) = runOnUiThread {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}