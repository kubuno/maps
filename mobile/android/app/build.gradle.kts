// The Kubuno maps client. A third app on the shared core; it consumes the maps
// module's HTTP API (proxied under /api/v1/maps) and reuses :core-account
// (accounts, sessions, the com.kubuno authenticator) and :core-ui (design
// tokens) so it stays aligned with the drive and mail apps by construction.
// The map itself is MapLibre Native (libre), not a Google SDK.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.kubuno.maps"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.kubuno.maps.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    // Release signing is opt-in: pass -PkubunoKeystore=… (and the passwords) to
    // sign, otherwise the release APK is unsigned (what the CI publishes). EVERY
    // Kubuno app MUST be signed with the SAME certificate — the shared-account
    // model grants access by matching signature.
    val keystorePath = (findProperty("kubunoKeystore") as String?)?.takeIf { it.isNotBlank() }
    val keystoreFile = keystorePath?.let { rootProject.file(it) }
    signingConfigs {
        if (keystoreFile != null && keystoreFile.exists()) {
            create("release") {
                storeFile = keystoreFile
                storePassword = findProperty("kubunoKeystorePassword") as String?
                keyAlias = findProperty("kubunoKeyAlias") as String?
                keyPassword = findProperty("kubunoKeyPassword") as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.kubuno.core.api)
    implementation(libs.kubuno.core.account)
    implementation(libs.kubuno.core.ui)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)

    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.kotlinx.serialization)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // The map renderer and its managed-annotation plugin (markers, route lines).
    implementation(libs.maplibre.android.sdk)
    implementation(libs.maplibre.annotation)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
}
