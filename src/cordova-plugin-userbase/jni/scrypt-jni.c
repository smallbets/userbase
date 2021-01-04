
#include <errno.h>
#include <string.h>
#include <jni.h>
#include <android/log.h>

#include "libscrypt.h"

#define  LOG_TAG    "libscrypt_crypho"
#define  LOGI(...)  __android_log_print(ANDROID_LOG_INFO,LOG_TAG,__VA_ARGS__)
#define  LOGE(...)  __android_log_print(ANDROID_LOG_ERROR,LOG_TAG,__VA_ARGS__)
#define  LOGV(...)  __android_log_print(ANDROID_LOG_VERBOSE,LOG_TAG,__VA_ARGS__)

static jobject JC_Integer;
static jmethodID JMID_Integer_intValue;

static jint callIntMethod(JNIEnv* env, jmethodID method, jobject integerObject, jint defaultValue);
static void throwException(JNIEnv* env, char *msg);

JNIEXPORT jbyteArray JNICALL
Java_com_crypho_plugins_ScryptPlugin_scrypt( JNIEnv* env, jobject thiz,
	jbyteArray pass, jbyteArray salt, jobject N, jobject r, jobject p, jobject dkLen)
{
    int i;
    char *msg_error;

    jint N_i = callIntMethod(env, JMID_Integer_intValue, N, SCRYPT_N);
    jint r_i = callIntMethod(env, JMID_Integer_intValue, r, SCRYPT_r);
    jint p_i = callIntMethod(env, JMID_Integer_intValue, p, SCRYPT_p);
    jint dkLen_i = callIntMethod(env, JMID_Integer_intValue, dkLen, 32);

    jint passLen = (*env)->GetArrayLength(env, pass);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to get passphrase lenght.");
        goto END;
    }

    jint saltLen = (*env)->GetArrayLength(env, salt);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to get salt lenght.");
        goto END;
    }

    jbyte *passphrase = (*env)->GetByteArrayElements(env, pass, NULL);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to get passphrase elements.");
        goto END;
    }

    jbyte *salt_bytes = (*env)->GetByteArrayElements(env, salt, NULL);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to get salt elements.");
        goto END;
    }

    uint8_t *hashbuf = malloc(sizeof(uint8_t) * dkLen_i);
    if (hashbuf == NULL) {
        msg_error = "Failed to malloc hashbuf.";
        LOGE("%s", msg_error);
        throwException(env, msg_error);
        goto END;
    }

    if (libscrypt_scrypt(passphrase, passLen, salt_bytes, saltLen, N_i, r_i, p_i, hashbuf, dkLen_i)) {
        switch (errno) {
            case EINVAL:
                msg_error = "N must be a power of 2 greater than 1.";
                break;
            case EFBIG:
            case ENOMEM:
                msg_error = "Insufficient memory available.";
                break;
            default:
                msg_error = "Memory allocation failed.";
        }
        throwException(env, msg_error);
        goto END;
    }

    jbyteArray result = (*env)->NewByteArray(env, dkLen_i);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to allocate result buffer.");
        goto END;
    }

    (*env)->SetByteArrayRegion(env, result, 0, dkLen_i, (jbyte *) hashbuf);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to set result buffer.");
        goto END;
    }

    END:
        if (passphrase) (*env)->ReleaseByteArrayElements(env, pass, passphrase, JNI_ABORT);
        if (salt_bytes) (*env)->ReleaseByteArrayElements(env, salt, salt_bytes, JNI_ABORT);
        if (hashbuf) free(hashbuf);

    return result;
}

static jint
callIntMethod(JNIEnv* env, jmethodID method, jobject integerObject, jint defaultValue) {
    if (integerObject == NULL) {
        return defaultValue;
    }
    jint result = (*env)->CallIntMethod(env, integerObject, method);
    if((*env)->ExceptionOccurred(env)) {
      return defaultValue;
    }
    return result;
}

static void
throwException(JNIEnv* env, char *msg) {
    jclass JC_Exception = (*env)->FindClass(env, "java/lang/Exception");
    (*env)->ThrowNew(env, JC_Exception, msg);
}

JNIEXPORT jint JNICALL
JNI_OnLoad(JavaVM* vm, void* aReserved){
    JNIEnv* env;
    jclass aClass;

    if ((*vm)->GetEnv(vm, (void **) &env, JNI_VERSION_1_6) != JNI_OK){
        LOGE("Failed to get the environment");
        return JNI_ERR;
    }

    aClass = (*env)->FindClass(env, "java/lang/Integer");
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to load class java.lang.Integer.");
        return JNI_ERR;
    }

    JC_Integer = (*env)->NewWeakGlobalRef(env, aClass);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to asign global java.lang.Integer.");
        return JNI_ERR;
    }

    (*env)->DeleteLocalRef(env, aClass);
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to delete local ref of java.lang.Integer.");
        return JNI_ERR;
    }

    JMID_Integer_intValue = (*env)->GetMethodID(env, JC_Integer, "intValue", "()I");
    if((*env)->ExceptionOccurred(env)) {
        LOGE("Failed to fetch inValue method from java.lang.Integer.");
        return JNI_ERR;
    }

//    env->RegisterNatives(activityClass, methodTable, sizeof(methodTable) / sizeof(methodTable[0]));
    return JNI_VERSION_1_6;
}

JNIEXPORT void JNICALL
JNI_OnUnLoad(JavaVM* vm, void* aReserved){
    JNIEnv* env;

    if ((*vm)->GetEnv(vm, (void **) &env, JNI_VERSION_1_6) != JNI_OK){
        LOGE("Failed to get the environment");
        return;
    }
    (*env)->DeleteWeakGlobalRef(env, JC_Integer);
}