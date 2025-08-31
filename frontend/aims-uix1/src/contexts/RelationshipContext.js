/**
 * RelationshipContext - Controller Layer
 * Document(RelationshipService)와 View 사이의 중재자
 * 상태 관리 및 View에서 발생한 이벤트를 Document로 전달
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { message } from 'antd';
import RelationshipService from '../services/RelationshipService';

// Context 생성
const RelationshipContext = createContext();

// 액션 타입 정의
const ActionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_RELATIONSHIP_TYPES: 'SET_RELATIONSHIP_TYPES',
  SET_CUSTOMER_RELATIONSHIPS: 'SET_CUSTOMER_RELATIONSHIPS',
  SET_ALL_RELATIONSHIPS_DATA: 'SET_ALL_RELATIONSHIPS_DATA',
  SET_FAMILY_REPRESENTATIVES: 'SET_FAMILY_REPRESENTATIVES',
  CLEAR_ERROR: 'CLEAR_ERROR'
};

// 초기 상태
const initialState = {
  loading: false,
  error: null,
  
  // 관계 유형 데이터 (전역 캐시)
  relationshipTypes: {},
  
  // 특정 고객의 관계 데이터 (고객별로 캐시)
  customerRelationships: new Map(),
  
  // 전체 관계 데이터 (트리뷰용)
  allRelationshipsData: {
    customers: [],
    relationships: [],
    timestamp: null
  },
  
  // 가족 대표자 설정 (사용자 수동 설정)
  familyRepresentatives: {}
};

// 리듀서
const relationshipReducer = (state, action) => {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      };

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };

    case ActionTypes.SET_RELATIONSHIP_TYPES:
      return {
        ...state,
        relationshipTypes: action.payload
      };

    case ActionTypes.SET_CUSTOMER_RELATIONSHIPS:
      const newCustomerRelationships = new Map(state.customerRelationships);
      newCustomerRelationships.set(action.payload.customerId, {
        relationships: action.payload.relationships,
        timestamp: Date.now()
      });
      return {
        ...state,
        customerRelationships: newCustomerRelationships
      };

    case ActionTypes.SET_ALL_RELATIONSHIPS_DATA:
      return {
        ...state,
        allRelationshipsData: action.payload
      };

    case ActionTypes.SET_FAMILY_REPRESENTATIVES:
      return {
        ...state,
        familyRepresentatives: {
          ...state.familyRepresentatives,
          ...action.payload
        }
      };

    default:
      return state;
  }
};

// Provider 컴포넌트
export const RelationshipProvider = ({ children }) => {
  const [state, dispatch] = useReducer(relationshipReducer, initialState);

  // 에러 처리 헬퍼
  const handleError = useCallback((error, userMessage = '작업 중 오류가 발생했습니다') => {
    console.error('RelationshipProvider error:', error);
    dispatch({ type: ActionTypes.SET_ERROR, payload: error.message });
    message.error(userMessage);
  }, []);

  // 로딩 상태 설정
  const setLoading = useCallback((loading) => {
    dispatch({ type: ActionTypes.SET_LOADING, payload: loading });
  }, []);

  // 에러 제거
  const clearError = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ERROR });
  }, []);

  // 관계 유형 로드
  const loadRelationshipTypes = useCallback(async () => {
    try {
      const types = await RelationshipService.getRelationshipTypes();
      dispatch({ type: ActionTypes.SET_RELATIONSHIP_TYPES, payload: types });
      return types;
    } catch (error) {
      handleError(error, '관계 유형을 불러오는데 실패했습니다');
      throw error;
    }
  }, [handleError]);

  // 특정 고객의 관계 데이터 로드
  const loadCustomerRelationships = useCallback(async (customerId) => {
    if (!customerId) return [];

    // 캐시 확인 (5분 이내 데이터는 재사용)
    const cached = state.customerRelationships.get(customerId);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.relationships;
    }

    try {
      setLoading(true);
      const relationships = await RelationshipService.getCustomerRelationships(customerId);
      
      dispatch({ 
        type: ActionTypes.SET_CUSTOMER_RELATIONSHIPS, 
        payload: { customerId, relationships } 
      });

      return relationships;
    } catch (error) {
      handleError(error, '관계 정보를 불러오는데 실패했습니다');
      return [];
    } finally {
      setLoading(false);
    }
  }, [state.customerRelationships, handleError, setLoading]);

  // 모든 관계 데이터 로드 (트리뷰용)
  const loadAllRelationshipsData = useCallback(async (forceRefresh = false) => {
    // 캐시 확인 (5분 이내 데이터는 재사용)
    if (!forceRefresh && 
        state.allRelationshipsData.timestamp && 
        Date.now() - state.allRelationshipsData.timestamp < 5 * 60 * 1000) {
      return state.allRelationshipsData;
    }

    try {
      setLoading(true);
      const data = await RelationshipService.getAllRelationshipsWithCustomers();
      
      dispatch({ type: ActionTypes.SET_ALL_RELATIONSHIPS_DATA, payload: data });
      return data;
    } catch (error) {
      handleError(error, '고객 관계 데이터를 불러오는데 실패했습니다');
      return { customers: [], relationships: [], timestamp: null };
    } finally {
      setLoading(false);
    }
  }, [state.allRelationshipsData, handleError, setLoading]);

  // 관계 삭제
  const deleteRelationship = useCallback(async (customerId, relationshipId) => {
    try {
      setLoading(true);
      await RelationshipService.deleteRelationship(customerId, relationshipId);
      
      // 성공 메시지
      message.success('관계가 삭제되었습니다');
      
      // 관련 캐시 무효화 - 자동으로 새로고침됨
      return true;
    } catch (error) {
      handleError(error, '관계 삭제에 실패했습니다');
      return false;
    } finally {
      setLoading(false);
    }
  }, [handleError, setLoading]);

  // 관계 생성
  const createRelationship = useCallback(async (fromCustomerId, toCustomerId, relationshipData) => {
    try {
      setLoading(true);
      const relationship = await RelationshipService.createRelationship(fromCustomerId, toCustomerId, relationshipData);
      
      message.success('관계가 생성되었습니다');
      return relationship;
    } catch (error) {
      handleError(error, '관계 생성에 실패했습니다');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError, setLoading]);

  // 양방향 관계 생성
  const createBidirectionalRelationship = useCallback(async (customerA, customerB, relationshipType, reverseType) => {
    try {
      setLoading(true);
      const result = await RelationshipService.createBidirectionalRelationship(customerA, customerB, relationshipType, reverseType);
      
      message.success('양방향 관계가 생성되었습니다');
      return result;
    } catch (error) {
      handleError(error, '양방향 관계 생성에 실패했습니다');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError, setLoading]);

  // 가족 대표자 설정
  const setFamilyRepresentative = useCallback((familyGroupKey, representativeId) => {
    dispatch({ 
      type: ActionTypes.SET_FAMILY_REPRESENTATIVES, 
      payload: { [familyGroupKey]: representativeId } 
    });
  }, []);

  // 캐시 강제 새로고침
  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      await RelationshipService.refreshCache();
      
      // 현재 표시 중인 데이터 모두 새로고침
      await Promise.all([
        loadRelationshipTypes(),
        loadAllRelationshipsData(true)
      ]);
      
      message.success('데이터가 새로고침되었습니다');
    } catch (error) {
      handleError(error, '데이터 새로고침에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [handleError, setLoading, loadRelationshipTypes, loadAllRelationshipsData]);

  // RelationshipService 이벤트 구독
  useEffect(() => {
    const unsubscribe = RelationshipService.subscribe((eventType, data) => {
      switch (eventType) {
        case 'relationship-created':
        case 'relationship-deleted':
        case 'relationship-updated':
          // 관련 고객 데이터 캐시 무효화
          const newCustomerRelationships = new Map(state.customerRelationships);
          if (data.fromCustomerId) {
            newCustomerRelationships.delete(data.fromCustomerId);
          }
          if (data.customerId) {
            newCustomerRelationships.delete(data.customerId);
          }
          
          // 전체 데이터 캐시도 무효화
          dispatch({ 
            type: ActionTypes.SET_ALL_RELATIONSHIPS_DATA, 
            payload: { customers: [], relationships: [], timestamp: null } 
          });
          break;

        case 'cache-refreshed':
          // 필요시 UI 업데이트
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, [state.customerRelationships]);

  // 초기 데이터 로드
  useEffect(() => {
    loadRelationshipTypes();
  }, [loadRelationshipTypes]);

  // Context 값 생성 (메모이제이션으로 불필요한 리렌더링 방지)
  const contextValue = useMemo(() => ({
    // State
    loading: state.loading,
    error: state.error,
    relationshipTypes: state.relationshipTypes,
    customerRelationships: state.customerRelationships,
    allRelationshipsData: state.allRelationshipsData,
    familyRepresentatives: state.familyRepresentatives,
    
    // Actions
    loadCustomerRelationships,
    loadAllRelationshipsData,
    deleteRelationship,
    createRelationship,
    createBidirectionalRelationship,
    setFamilyRepresentative,
    refreshData,
    clearError
  }), [
    state,
    loadCustomerRelationships,
    loadAllRelationshipsData,
    deleteRelationship,
    createRelationship,
    createBidirectionalRelationship,
    setFamilyRepresentative,
    refreshData,
    clearError
  ]);

  return (
    <RelationshipContext.Provider value={contextValue}>
      {children}
    </RelationshipContext.Provider>
  );
};

// Custom Hook
export const useRelationship = () => {
  const context = useContext(RelationshipContext);
  
  if (!context) {
    throw new Error('useRelationship must be used within a RelationshipProvider');
  }
  
  return context;
};

export default RelationshipContext;