#ifndef SIZE_MAX
#	if defined(__LP64__)
#		define SIZE_MAX       UINT64_MAX
#	else
#		define SIZE_MAX       UINT32_MAX
#	endif
#endif