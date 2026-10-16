plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

// Signed with the key from the ST_SIGNING_KEYSTORE GitHub secret, so updates install over the
// previous version and the phone and watch apps can talk to each other.
val stKeystore = System.getenv("ST_KEYSTORE_PATH")?.let { file(it) }?.takeIf { it.exists() }
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0) + 100

android {
    namespace = "com.jak.simpletimesheet.wear"
    compileSdk = 35
    defaultConfig {
        // Must match the phone app (and be signed with the same key) for the watch to reach it.
        applicationId = "com.jak.simpletimesheet"
        minSdk = 30
        targetSdk = 35
        versionCode = buildNumber
        versionName = "watch-$buildNumber"
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
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-material:1.2.1")
    implementation("com.google.guava:guava:33.3.1-android")
}
