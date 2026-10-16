plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }

// Tap recording shared by the phone widget and the watch, so both follow the same rules.
android {
    namespace = "com.jak.simpletimesheet.core"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies { testImplementation("junit:junit:4.13.2") }
