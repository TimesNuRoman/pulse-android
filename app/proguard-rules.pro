# Pulse Android — ProGuard / R8 rules
# Strip everything we don't need; keep JNI / Room / Compose runtime intact.

# ----- Kotlin -----
-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}

# ----- Compose -----
-keep class androidx.compose.runtime.** { *; }
-keepclassmembers class androidx.compose.runtime.** { *; }
-dontwarn androidx.compose.**

# ----- Room -----
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**

# ----- Hilt -----
-keep class * extends dagger.hilt.android.HiltAndroidApp
-keep class * extends dagger.hilt.internal.GeneratedComponent
-keep,allowobfuscation @interface dagger.hilt.**
-keep,allowobfuscation @interface dagger.**

# ----- JNI: keep native bridge classes + method names -----
# Methods called from native code must keep their JNI symbol names.
-keep class com.pulse.android.data.llm.LlamaEngine { *; }
-keepclasseswithmembers class * {
    native <methods>;
}
-keepclassmembers class * {
    native <methods>;
}

# ----- WorkManager workers -----
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.CoroutineWorker

# ----- Standard library -----
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes Signature,InnerClasses,EnclosingMethod

# ----- OkHttp -----
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ----- Google Tink (used by EncryptedSharedPreferences) -----
-dontwarn com.google.errorprone.annotations.**
-dontwarn com.google.api.client.**
-dontwarn javax.annotation.**
-dontwarn javax.inject.**
-dontwarn org.joda.time.**
-dontwarn org.checkerframework.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-keep class com.google.crypto.tink.** { *; }
-keep class com.google.errorprone.annotations.** { *; }

# ----- BouncyCastle scrypt -----
-dontwarn org.bouncycastle.**
-keep class org.bouncycastle.crypto.generators.SCrypt { *; }
-keep class org.bouncycastle.jcajce.provider.** { *; }

# ----- CommonMark (markdown) -----
-dontwarn org.commonmark.**

# ----- Strip log calls in release -----
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# ----- Keep BuildConfig fields (versionCode/versionName) -----
-keep class com.pulse.android.BuildConfig { *; }

# ----- Don't warn about R8 inlining on optional deps -----
-dontwarn java.lang.invoke.StringConcatFactory
