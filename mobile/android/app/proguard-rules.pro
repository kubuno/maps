# kotlinx.serialization: keep generated serializers for the DTOs.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class com.kubuno.maps.net.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.kubuno.maps.net.**$$serializer { *; }
-keepclassmembers class com.kubuno.maps.net.** {
    <fields>;
}

# Retrofit: keep the API interface and its Kotlin metadata (suspend signatures).
-keep,allowobfuscation interface com.kubuno.maps.net.MapsApi
-keepattributes Signature, Exceptions

# MapLibre Native ships its own consumer rules; nothing to add here.
