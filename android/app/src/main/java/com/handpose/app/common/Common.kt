package com.handpose.app.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Sealed class representing the loading state of an operation
 */
sealed class LoadingState {
    data object Idle : LoadingState()
    data object Loading : LoadingState()
    data object Success : LoadingState()
    data class Error(val message: String) : LoadingState()
}

/**
 * Base ViewModel providing common state management patterns for all ViewModels.
 *
 * This abstract class eliminates duplicated boilerplate for:
 * - StateFlow management
 * - Loading state transitions
 * - Error handling
 * - viewModelScope coroutine management
 *
 * Subclasses must define their UiState type and implement state updating logic.
 *
 * @param T The UI state type that extends BaseUiState
 */
abstract class BaseViewModel<T : BaseUiState> : ViewModel() {

    protected abstract val initialState: T

    private val _uiState: MutableStateFlow<T> by lazy { MutableStateFlow(initialState) }
    val uiState: StateFlow<T> = _uiState.asStateFlow()

    /**
     * Updates the UI state using a lambda function
     */
    protected fun updateState(update: (T) -> T) {
        _uiState.update(update)
    }

    /**
     * Gets the current UI state value
     */
    protected val currentState: T
        get() = _uiState.value

    /**
     * Sets loading state to true and clears error
     */
    protected fun setLoading() {
        _uiState.update { state ->
            @Suppress("UNCHECKED_CAST")
            (state ?: initialState).copyWith(
                loadingState = LoadingState.Loading,
                errorMessage = null
            ) as T
        }
    }

    /**
     * Sets loading state to success
     */
    protected fun setSuccess() {
        _uiState.update { state ->
            @Suppress("UNCHECKED_CAST")
            (state ?: initialState).copyWith(loadingState = LoadingState.Success) as T
        }
    }

    /**
     * Sets error state with message
     */
    protected fun setError(message: String?) {
        _uiState.update { state ->
            @Suppress("UNCHECKED_CAST")
            (state ?: initialState).copyWith(
                loadingState = LoadingState.Error(message ?: "Unknown error"),
                errorMessage = message
            ) as T
        }
    }

    /**
     * Clears the error message
     */
    fun clearError() {
        _uiState.update { state ->
            @Suppress("UNCHECKED_CAST")
            (state ?: initialState).copyWith(errorMessage = null) as T
        }
    }

    /**
     * Executes a suspending operation with automatic loading state management.
     *
     * Loading state flow:
     * 1. Sets loading state to Loading
     * 2. Executes the operation
     * 3. On success: Sets state to Success
     * 4. On failure: Sets state to Error with exception message
     *
     * @param operation The suspending operation to execute
     * @param onSuccess Callback invoked on successful completion with result
     * @param onError Optional callback for custom error handling
     */
    protected fun <R> executeWithLoading(
        operation: suspend CoroutineScope.() -> Result<R>,
        onSuccess: (R) -> Unit,
        onError: ((Throwable) -> Unit)? = null
    ) {
        viewModelScope.launch {
            setLoading()

            val result = operation()

            result.fold(
                onSuccess = { data ->
                    setSuccess()
                    onSuccess(data)
                },
                onFailure = { exception ->
                    setError(exception.message)
                    onError?.invoke(exception)
                }
            )
        }
    }

    /**
     * Executes a suspending operation without automatic loading state management.
     * Useful for operations that need custom state handling.
     *
     * @param operation The suspending operation to execute
     */
    protected fun launchInViewModel(operation: suspend CoroutineScope.() -> Unit) {
        viewModelScope.launch {
            operation()
        }
    }
}

/**
 * Base interface for all UI states.
 * Provides common properties that all UI states should have.
 */
interface BaseUiState {
    val loadingState: LoadingState
    val errorMessage: String?

    /**
     * Creates a copy of this state with updated values.
     * Subclasses should implement this using their data class copy() method.
     */
    fun copyWith(
        loadingState: LoadingState = this.loadingState,
        errorMessage: String? = this.errorMessage
    ): BaseUiState
}

/**
 * Extension property to check if state is currently loading
 */
val BaseUiState.isLoading: Boolean
    get() = loadingState is LoadingState.Loading

/**
 * Extension property to check if state has an error
 */
val BaseUiState.hasError: Boolean
    get() = loadingState is LoadingState.Error

/**
 * Extension property to get error message if in error state
 */
val BaseUiState.errorMessageFromState: String?
    get() = (loadingState as? LoadingState.Error)?.message

// ============================================================================
// SECTION: Entity ViewModels
// ============================================================================

/**
 * Base ViewModel for managing a single entity (e.g., Patient detail, Project detail, Recording detail).
 *
 * Provides:
 * - Entity state management (StateFlow<T?>)
 * - Loading state with LoadingState sealed class
 * - Error handling
 * - Refresh functionality
 * - Automatic state transitions
 *
 * Reduces ~50-80 LOC per single-entity ViewModel.
 *
 * @param T The entity type to manage
 */
abstract class BaseEntityViewModel<T : Any> : BaseViewModel<EntityUiState<T>>() {

    override val initialState: EntityUiState<T> = EntityUiState()

    /**
     * Loads the entity from the data source.
     * Subclasses implement the actual data fetching logic.
     *
     * @param id The identifier for the entity to load
     * @return Result containing the loaded entity or error
     */
    protected abstract suspend fun loadEntityData(id: String): Result<T>

    /**
     * Loads an entity by ID with automatic state management.
     *
     * State transitions:
     * - Sets loading state
     * - Calls loadEntityData()
     * - On success: Updates entity and sets success state
     * - On failure: Sets error state
     *
     * @param id The entity ID to load
     */
    fun loadEntity(id: String) {
        executeWithLoading(
            operation = { loadEntityData(id) },
            onSuccess = { entity ->
                updateState { it.copy(entity = entity) }
            }
        )
    }

    /**
     * Refreshes the currently loaded entity.
     * Uses the entity ID from current state.
     */
    fun refreshEntity() {
        val entityId = getEntityId(currentState.entity)
        if (entityId != null) {
            loadEntity(entityId)
        } else {
            setError("No entity loaded to refresh")
        }
    }

    /**
     * Extracts the entity ID from the entity.
     * Subclasses must implement this to provide the ID field.
     *
     * @param entity The entity instance
     * @return The entity's unique identifier
     */
    protected abstract fun getEntityId(entity: T?): String?

    /**
     * Clears the currently loaded entity
     */
    fun clearEntity() {
        updateState { it.copy(entity = null) }
    }
}

/**
 * UI State for single entity ViewModels
 *
 * @param T The entity type
 * @property entity The loaded entity, null if not loaded or failed
 * @property loadingState Current loading state
 * @property errorMessage Error message if any
 */
data class EntityUiState<T : Any>(
    val entity: T? = null,
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): EntityUiState<T> {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}

// ============================================================================
// SECTION: List ViewModels
// ============================================================================

/**
 * Base ViewModel for managing a list of entities (e.g., Projects list, Patients list).
 *
 * Provides:
 * - List state management (StateFlow<List<T>>)
 * - Loading and refreshing states
 * - Error handling
 * - Automatic state transitions
 * - Optional search/filtering support
 *
 * Reduces ~60-100 LOC per list ViewModel.
 *
 * @param T The entity type in the list
 */
abstract class BaseListViewModel<T : Any> : BaseViewModel<ListUiState<T>>() {

    override val initialState: ListUiState<T> = ListUiState()

    /**
     * Loads the list of entities from the data source.
     * Subclasses implement the actual data fetching logic.
     *
     * @return Result containing the list of entities or error
     */
    protected abstract suspend fun loadListData(): Result<List<T>>

    /**
     * Loads the list with automatic state management.
     *
     * State transitions:
     * - Sets loading state
     * - Calls loadListData()
     * - On success: Updates items and sets success state
     * - On failure: Sets error state with empty list
     */
    fun loadList() {
        executeWithLoading(
            operation = { loadListData() },
            onSuccess = { items ->
                updateState { it.copy(items = items) }
            },
            onError = {
                updateState { it.copy(items = emptyList()) }
            }
        )
    }

    /**
     * Refreshes the list.
     * Similar to loadList but with isRefreshing flag.
     */
    fun refreshList() {
        launchInViewModel {
            updateState { it.copy(isRefreshing = true, errorMessage = null) }

            val result = loadListData()

            result.fold(
                onSuccess = { items ->
                    updateState {
                        it.copy(
                            items = items,
                            isRefreshing = false,
                            loadingState = LoadingState.Success
                        )
                    }
                },
                onFailure = { exception ->
                    updateState {
                        it.copy(
                            items = emptyList(),
                            isRefreshing = false,
                            loadingState = LoadingState.Error(exception.message ?: "Unknown error"),
                            errorMessage = exception.message
                        )
                    }
                }
            )
        }
    }

    /**
     * Clears the list
     */
    fun clearList() {
        updateState { it.copy(items = emptyList()) }
    }
}

/**
 * UI State for list-based ViewModels
 *
 * @param T The entity type in the list
 * @property items The list of entities
 * @property loadingState Current loading state
 * @property errorMessage Error message if any
 * @property isRefreshing True if currently refreshing (pull-to-refresh)
 */
data class ListUiState<T : Any>(
    val items: List<T> = emptyList(),
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null,
    val isRefreshing: Boolean = false
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): ListUiState<T> {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}

// ============================================================================
// SECTION: Searchable List ViewModels
// ============================================================================

/**
 * Base ViewModel for managing a searchable/filterable list of entities.
 *
 * Provides all features of BaseListViewModel plus:
 * - Search query management
 * - Filtered results
 * - Automatic filtering on query change
 *
 * @param T The entity type in the list
 */
abstract class BaseSearchableListViewModel<T : Any> : BaseViewModel<SearchableListUiState<T>>() {

    override val initialState: SearchableListUiState<T> = SearchableListUiState()

    /**
     * Loads the list of entities from the data source.
     */
    protected abstract suspend fun loadListData(): Result<List<T>>

    /**
     * Filters the items based on the search query.
     * Subclasses must implement the filtering logic.
     *
     * @param items All items
     * @param query The search query
     * @return Filtered list of items
     */
    protected abstract fun filterItems(items: List<T>, query: String): List<T>

    /**
     * Loads the list with automatic state management
     */
    fun loadList() {
        executeWithLoading(
            operation = { loadListData() },
            onSuccess = { items ->
                updateState {
                    it.copy(
                        items = items,
                        filteredItems = filterItems(items, it.searchQuery)
                    )
                }
            },
            onError = {
                updateState { it.copy(items = emptyList(), filteredItems = emptyList()) }
            }
        )
    }

    /**
     * Updates the search query and re-filters items
     */
    fun updateSearchQuery(query: String) {
        updateState {
            it.copy(
                searchQuery = query,
                filteredItems = filterItems(it.items, query)
            )
        }
    }

    /**
     * Refreshes the list
     */
    fun refreshList() {
        launchInViewModel {
            updateState { it.copy(isRefreshing = true, errorMessage = null) }

            val result = loadListData()

            result.fold(
                onSuccess = { items ->
                    updateState {
                        it.copy(
                            items = items,
                            filteredItems = filterItems(items, it.searchQuery),
                            isRefreshing = false,
                            loadingState = LoadingState.Success
                        )
                    }
                },
                onFailure = { exception ->
                    updateState {
                        it.copy(
                            items = emptyList(),
                            filteredItems = emptyList(),
                            isRefreshing = false,
                            loadingState = LoadingState.Error(exception.message ?: "Unknown error"),
                            errorMessage = exception.message
                        )
                    }
                }
            )
        }
    }
}

/**
 * UI State for searchable list ViewModels
 *
 * @param T The entity type in the list
 * @property items All items (unfiltered)
 * @property filteredItems Items matching the search query
 * @property searchQuery Current search query
 * @property loadingState Current loading state
 * @property errorMessage Error message if any
 * @property isRefreshing True if currently refreshing
 */
data class SearchableListUiState<T : Any>(
    val items: List<T> = emptyList(),
    val filteredItems: List<T> = emptyList(),
    val searchQuery: String = "",
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null,
    val isRefreshing: Boolean = false
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): SearchableListUiState<T> {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}
