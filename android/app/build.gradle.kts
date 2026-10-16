plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

// Signed with the key from the ST_SIGNING_KEYSTORE GitHub secret, so updates install over the
// previous version and the phone and watch apps can talk to each other.
val stKeystore = System.getenv("ST_KEYSTORE_PATH")?.let { file(it) }?.takeIf { it.exists() }
// Each GitHub build gets a higher version number, which is how the app spots a newer release.
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0) + 100

android {
    namespace = "com.jak.simpletimesheet"
    compileSdk = 35
    defaultConfig {
        // The watch app uses the same ID and signing key so the two can talk to each other.
        applicationId = "com.jak.simpletimesheet"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "2.$buildNumber"
    }
    signingConfigs {
        if (stKeystore != null) create("st") {
            storeFile = stKeystore; storePassword = "simpletimesheet"; keyAlias = "st"; keyPassword = "simpletimesheet"
        }
    }
    buildTypes { getByName("debug") { if (stKeystore != null) signingConfig = signingConfigs.getByName("st") } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":core"))
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("androidx.core:core:1.13.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
