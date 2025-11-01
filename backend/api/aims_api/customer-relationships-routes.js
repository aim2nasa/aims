// customer-relationships-routes.js - 고객 관계 관리 API 라우트

const { ObjectId } = require('mongodb');
const { utcNowDate, utcNowISO } = require('./lib/timeUtils');

// 관계 유형 정의
const RELATIONSHIP_TYPES = {
  // 가족 관계
  // 가족관계등록부 범위 내 관계 유형만 허용
  family: {
    spouse: { reverse: 'spouse', bidirectional: true, label: '배우자' },
    parent: { reverse: 'child', bidirectional: false, label: '부모' },
    child: { reverse: 'parent', bidirectional: false, label: '자녀' }
  },
  
  // 친척 관계  
  relative: {
    uncle_aunt: { reverse: 'nephew_niece', bidirectional: false, label: '삼촌/이모' },
    nephew_niece: { reverse: 'uncle_aunt', bidirectional: false, label: '조카' },
    cousin: { reverse: 'cousin', bidirectional: true, label: '사촌' },
    in_law: { reverse: 'in_law', bidirectional: true, label: '처가/시가' }
  },
  
  // 사회적 관계
  social: {
    friend: { reverse: 'friend', bidirectional: true, label: '친구' },
    acquaintance: { reverse: 'acquaintance', bidirectional: true, label: '지인' },
    neighbor: { reverse: 'neighbor', bidirectional: true, label: '이웃' }
  },
  
  // 직장 관계
  professional: {
    supervisor: { reverse: 'subordinate', bidirectional: false, label: '상사' },
    subordinate: { reverse: 'supervisor', bidirectional: false, label: '부하' },
    colleague: { reverse: 'colleague', bidirectional: true, label: '동료' },
    business_partner: { reverse: 'business_partner', bidirectional: true, label: '사업파트너' },
    client: { reverse: 'service_provider', bidirectional: false, label: '클라이언트' },
    service_provider: { reverse: 'client', bidirectional: false, label: '서비스제공자' }
  },
  
  // 법인-개인 관계
  corporate: {
    ceo: { reverse: 'company', bidirectional: false, label: '대표이사' },
    executive: { reverse: 'company', bidirectional: false, label: '임원' },
    employee: { reverse: 'employer', bidirectional: false, label: '직원' },
    shareholder: { reverse: 'company', bidirectional: false, label: '주주' },
    director: { reverse: 'company', bidirectional: false, label: '이사' },
    company: { reverse: 'employee', bidirectional: false, label: '회사' },
    employer: { reverse: 'employee', bidirectional: false, label: '고용주' }
  }
};

// 모든 관계 유형을 평면화
const getAllRelationshipTypes = () => {
  const allTypes = {};
  Object.entries(RELATIONSHIP_TYPES).forEach(([category, types]) => {
    Object.entries(types).forEach(([type, config]) => {
      allTypes[type] = { ...config, category };
    });
  });
  return allTypes;
};

const setupCustomerRelationshipRoutes = (app, db) => {
  
  // 1. 고객 관계 생성
  app.post('/api/customers/:id/relationships', async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        to_customer_id, 
        relationship_type, 
        relationship_details = {},
        insurance_relevance = {},
        strength = 'medium'
      } = req.body;

      // 유효성 검사
      if (!ObjectId.isValid(id) || !ObjectId.isValid(to_customer_id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      if (id === to_customer_id) {
        return res.status(400).json({
          success: false,
          error: '자기 자신과는 관계를 설정할 수 없습니다.'
        });
      }

      const allTypes = getAllRelationshipTypes();
      if (!allTypes[relationship_type]) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 관계 유형입니다.',
          available_types: Object.keys(allTypes)
        });
      }

      // 두 고객이 모두 존재하는지 확인
      const [fromCustomer, toCustomer] = await Promise.all([
        db.collection('customers').findOne({ _id: new ObjectId(id) }),
        db.collection('customers').findOne({ _id: new ObjectId(to_customer_id) })
      ]);

      if (!fromCustomer || !toCustomer) {
        return res.status(404).json({
          success: false,
          error: '고객을 찾을 수 없습니다.'
        });
      }

      // 기존 관계 중복 체크
      const existingRelation = await db.collection('customer_relationships').findOne({
        'relationship_info.from_customer_id': new ObjectId(id),
        'relationship_info.to_customer_id': new ObjectId(to_customer_id),
        'relationship_info.status': 'active'
      });

      if (existingRelation) {
        return res.status(400).json({
          success: false,
          error: '이미 등록된 관계입니다.',
          existing_relationship: existingRelation.relationship_info.relationship_type
        });
      }

      const typeConfig = allTypes[relationship_type];
      const now = utcNowDate();

      // 관계 데이터 생성
      const relationshipData = {
        from_customer: new ObjectId(id),        // RightPane의 고객 (가족 대표)
        related_customer: new ObjectId(to_customer_id),  // 선택된 상대방
        family_representative: new ObjectId(id), // 가족 대표 명시적 저장
        relationship_info: {
          from_customer_id: new ObjectId(id),
          to_customer_id: new ObjectId(to_customer_id),
          relationship_type,
          relationship_category: typeConfig.category,
          is_bidirectional: typeConfig.bidirectional,
          strength,
          status: 'active'
        },
        relationship_details: {
          description: relationship_details.description || '',
          established_date: relationship_details.established_date ? new Date(relationship_details.established_date) : null,
          notes: relationship_details.notes || '',
          contact_frequency: relationship_details.contact_frequency || 'unknown',
          influence_level: relationship_details.influence_level || 'medium'
        },
        insurance_relevance: {
          is_beneficiary: insurance_relevance.is_beneficiary || false,
          is_insured: insurance_relevance.is_insured || false,
          shared_policies: insurance_relevance.shared_policies || [],
          referral_potential: insurance_relevance.referral_potential || 'medium',
          cross_selling_opportunity: insurance_relevance.cross_selling_opportunity || false
        },
        meta: {
          created_at: now,
          updated_at: now,
          created_by: new ObjectId('000000000000000000000000'), // 임시 - 실제로는 로그인한 사용자 ID
          last_modified_by: new ObjectId('000000000000000000000000'),
          verified: false,
          verification_date: null,
          verified_by: null
        }
      };

      // 관계 저장
      const result = await db.collection('customer_relationships').insertOne(relationshipData);

      // 양방향 관계이거나 family 관계인 경우 역방향 관계도 생성
      if (typeConfig.bidirectional || typeConfig.category === 'family') {
        // 역방향 관계 중복 체크
        const existingReverseRelation = await db.collection('customer_relationships').findOne({
          'relationship_info.from_customer_id': new ObjectId(to_customer_id),
          'relationship_info.to_customer_id': new ObjectId(id),
          'relationship_info.status': 'active'
        });

        if (!existingReverseRelation) {
          const reverseRelationshipData = {
            ...relationshipData,
            _id: undefined, // 새로운 _id 생성
            from_customer: new ObjectId(to_customer_id),  // 역방향: 상대방이 from_customer
            related_customer: new ObjectId(id),           // 역방향: 원래 고객이 related_customer
            family_representative: new ObjectId(id),      // 가족 대표는 동일 (최초 관계 생성자)
            relationship_info: {
              ...relationshipData.relationship_info,
              from_customer_id: new ObjectId(to_customer_id),
              to_customer_id: new ObjectId(id),
              relationship_type: typeConfig.reverse
            }
          };
          
          await db.collection('customer_relationships').insertOne(reverseRelationshipData);
        }
      }

      res.json({
        success: true,
        data: {
          relationship_id: result.insertedId,
          message: '관계가 성공적으로 등록되었습니다.'
        }
      });

    } catch (error) {
      console.error('관계 생성 오류:', error);
      res.status(500).json({
        success: false,
        error: '관계 생성 중 오류가 발생했습니다.'
      });
    }
  });

  // 2. 고객 관계 조회
  app.get('/api/customers/:id/relationships', async (req, res) => {
    try {
      const { id } = req.params;
      const { category, type, include_details = 'true' } = req.query;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      // 현재 고객 정보 조회하여 법인/개인 구분
      const currentCustomer = await db.collection('customers').findOne({ _id: new ObjectId(id) });
      if (!currentCustomer) {
        return res.status(404).json({
          success: false,
          error: '고객을 찾을 수 없습니다.'
        });
      }

      const isCompany = currentCustomer.insurance_info?.customer_type === '법인';

      // 관계 조회: 개인 고객은 단방향, 법인 고객은 양방향 조회
      let baseFilter;
      if (isCompany) {
        // 법인 고객: 양방향 조회 (개인 → 법인 관계가 대부분)
        baseFilter = {
          $or: [
            { 'relationship_info.from_customer_id': new ObjectId(id) },
            { 'relationship_info.to_customer_id': new ObjectId(id) }
          ],
          'relationship_info.status': 'active'
        };
      } else {
        // 개인 고객: 단방향 조회 (중복 방지)
        baseFilter = {
          'relationship_info.from_customer_id': new ObjectId(id),
          'relationship_info.status': 'active'
        };
      }

      // 법인 고객인 경우 모든 corporate 관계 조회 (직원, 이사, 임원 등)
      if (isCompany) {
        baseFilter['relationship_info.relationship_category'] = 'corporate';
      }

      if (category) {
        baseFilter['relationship_info.relationship_category'] = category;
      }

      if (type) {
        baseFilter['relationship_info.relationship_type'] = type;
      }

      const relationships = await db.collection('customer_relationships')
        .find(baseFilter)
        .sort({ 'meta.created_at': -1 })
        .toArray();

      // 관련 고객 정보 포함 여부
      if (include_details === 'true' && relationships.length > 0) {
        const relatedCustomerIds = [];
        
        relationships.forEach(rel => {
          // 현재 고객이 from_customer인 경우 to_customer_id를 수집
          if (rel.relationship_info.from_customer_id.toString() === id) {
            relatedCustomerIds.push(rel.relationship_info.to_customer_id);
          }
          // 현재 고객이 to_customer인 경우 from_customer_id를 수집 (법인만)
          else if (rel.relationship_info.to_customer_id.toString() === id) {
            relatedCustomerIds.push(rel.relationship_info.from_customer_id);
          }
        });

        let relatedCustomersFilter = { _id: { $in: relatedCustomerIds } };
        
        // 법인 고객인 경우 관련 고객은 개인만 조회
        if (isCompany) {
          relatedCustomersFilter['insurance_info.customer_type'] = '개인';
        }

        const relatedCustomers = await db.collection('customers')
          .find(relatedCustomersFilter)
          .toArray();

        const customerMap = {};
        relatedCustomers.forEach(customer => {
          customerMap[customer._id.toString()] = customer;
        });

        // 각 관계에 관련 고객 정보 추가
        relationships.forEach(rel => {
          let relatedCustomerId;
          let isReversed = false;
          
          if (rel.relationship_info.from_customer_id.toString() === id) {
            // 현재 고객이 from_customer → to_customer가 관련 고객
            relatedCustomerId = rel.relationship_info.to_customer_id.toString();
          } else {
            // 현재 고객이 to_customer → from_customer가 관련 고객 (역방향)
            relatedCustomerId = rel.relationship_info.from_customer_id.toString();
            isReversed = true;
          }
          
          rel.related_customer = customerMap[relatedCustomerId] || null;
          rel.is_reversed = isReversed;
          
          // 역방향 관계인 경우 관계 유형을 현재 고객 관점으로 변환
          if (isReversed) {
            const allTypes = getAllRelationshipTypes();
            const originalType = rel.relationship_info.relationship_type;
            const reverseType = allTypes[originalType]?.reverse;
            
            if (reverseType) {
              rel.display_relationship_type = reverseType;
              rel.display_relationship_label = allTypes[reverseType]?.label || reverseType;
            } else {
              // 역방향 관계가 정의되지 않은 경우 원본 유지
              rel.display_relationship_type = originalType;
              rel.display_relationship_label = allTypes[originalType]?.label || originalType;
            }
          } else {
            rel.display_relationship_type = rel.relationship_info.relationship_type;
            rel.display_relationship_label = getAllRelationshipTypes()[rel.relationship_info.relationship_type]?.label || rel.relationship_info.relationship_type;
          }
        });
      }

      res.json({
        success: true,
        data: {
          relationships,
          total_count: relationships.length,
          categories: [...new Set(relationships.map(r => r.relationship_info.relationship_category))]
        }
      });

    } catch (error) {
      console.error('관계 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '관계 조회 중 오류가 발생했습니다.'
      });
    }
  });

  // 3. 관계 네트워크 분석
  app.get('/api/customers/:id/network-analysis', async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      // 직접 연결된 관계들 조회
      const directRelationships = await db.collection('customer_relationships')
        .find({
          'relationship_info.from_customer_id': new ObjectId(id),
          'relationship_info.status': 'active'
        })
        .toArray();

      // 카테고리별 통계
      const categoryStats = {};
      const typeStats = {};
      let totalInfluenceScore = 0;

      directRelationships.forEach(rel => {
        const category = rel.relationship_info.relationship_category;
        const type = rel.relationship_info.relationship_type;
        const strength = rel.relationship_info.strength;
        
        categoryStats[category] = (categoryStats[category] || 0) + 1;
        typeStats[type] = (typeStats[type] || 0) + 1;
        
        // 영향력 점수 계산 (강도별 가중치)
        const strengthScore = strength === 'strong' ? 3 : strength === 'medium' ? 2 : 1;
        totalInfluenceScore += strengthScore;
      });

      // 추천 잠재력 계산
      const networkSize = directRelationships.length;
      const referralPotential = networkSize > 20 ? 'high' : networkSize > 10 ? 'medium' : 'low';

      // 주요 영향력자 식별 (strong 관계 + 특정 유형)
      const keyInfluencers = directRelationships
        .filter(rel => 
          rel.relationship_info.strength === 'strong' ||
          ['spouse', 'parent', 'supervisor', 'business_partner'].includes(rel.relationship_info.relationship_type)
        )
        .map(rel => rel.relationship_info.to_customer_id);

      res.json({
        success: true,
        data: {
          network_size: networkSize,
          category_breakdown: categoryStats,
          type_breakdown: typeStats,
          influence_score: totalInfluenceScore,
          referral_potential: referralPotential,
          key_influencers_count: keyInfluencers.length,
          analysis_date: utcNowISO()
        }
      });

    } catch (error) {
      console.error('네트워크 분석 오류:', error);
      res.status(500).json({
        success: false,
        error: '네트워크 분석 중 오류가 발생했습니다.'
      });
    }
  });

  // 4. 관계 수정
  app.put('/api/customers/:id/relationships/:relationshipId', async (req, res) => {
    try {
      const { id, relationshipId } = req.params;
      const updateData = req.body;

      if (!ObjectId.isValid(id) || !ObjectId.isValid(relationshipId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.'
        });
      }

      const updateFields = {};
      
      if (updateData.relationship_details) {
        Object.entries(updateData.relationship_details).forEach(([key, value]) => {
          updateFields[`relationship_details.${key}`] = value;
        });
      }

      if (updateData.insurance_relevance) {
        Object.entries(updateData.insurance_relevance).forEach(([key, value]) => {
          updateFields[`insurance_relevance.${key}`] = value;
        });
      }

      if (updateData.strength) {
        updateFields['relationship_info.strength'] = updateData.strength;
      }

      updateFields['meta.updated_at'] = utcNowDate();
      updateFields['meta.last_modified_by'] = new ObjectId('000000000000000000000000'); // 임시

      const result = await db.collection('customer_relationships').updateOne(
        { 
          _id: new ObjectId(relationshipId),
          'relationship_info.from_customer_id': new ObjectId(id)
        },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: '관계를 찾을 수 없습니다.'
        });
      }

      res.json({
        success: true,
        data: { message: '관계가 성공적으로 수정되었습니다.' }
      });

    } catch (error) {
      console.error('관계 수정 오류:', error);
      res.status(500).json({
        success: false,
        error: '관계 수정 중 오류가 발생했습니다.'
      });
    }
  });

  // 5. 관계 삭제 - HARD DELETE로 수정됨
  app.delete('/api/customers/:id/relationships/:relationshipId', async (req, res) => {
    try {
      const { id, relationshipId } = req.params;

      if (!ObjectId.isValid(id) || !ObjectId.isValid(relationshipId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.'
        });
      }

      // 관계 정보 조회 (양방향 관계 처리를 위해)
      const relationship = await db.collection('customer_relationships').findOne({
        _id: new ObjectId(relationshipId),
        'relationship_info.from_customer_id': new ObjectId(id)
      });

      if (!relationship) {
        return res.status(404).json({
          success: false,
          error: '관계를 찾을 수 없습니다.'
        });
      }

      // 관계 삭제 (hard delete)
      await db.collection('customer_relationships').deleteOne(
        { _id: new ObjectId(relationshipId) }
      );

      // 양방향 관계이거나 family 관계인 경우 역방향 관계도 삭제
      if (relationship.relationship_info.is_bidirectional || relationship.relationship_info.relationship_category === 'family') {
        await db.collection('customer_relationships').deleteMany(
          {
            'relationship_info.from_customer_id': relationship.relationship_info.to_customer_id,
            'relationship_info.to_customer_id': relationship.relationship_info.from_customer_id,
            'relationship_info.status': 'active'
          }
        );
      }

      res.json({
        success: true,
        data: { message: '관계가 성공적으로 삭제되었습니다.' }
      });

    } catch (error) {
      console.error('관계 삭제 오류:', error);
      res.status(500).json({
        success: false,
        error: '관계 삭제 중 오류가 발생했습니다.'
      });
    }
  });

  // 6. 관계 유형 목록 조회
  app.get('/api/relationship-types', (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          categories: RELATIONSHIP_TYPES,
          all_types: getAllRelationshipTypes()
        }
      });
    } catch (error) {
      console.error('관계 유형 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '관계 유형 조회 중 오류가 발생했습니다.'
      });
    }
  });

  // 7. 관계 통계 조회
  app.get('/api/customers/:id/relationship-stats', async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      // 집계 쿼리로 통계 계산
      const stats = await db.collection('customer_relationships').aggregate([
        {
          $match: {
            'relationship_info.from_customer_id': new ObjectId(id),
            'relationship_info.status': 'active'
          }
        },
        {
          $group: {
            _id: {
              category: '$relationship_info.relationship_category',
              type: '$relationship_info.relationship_type'
            },
            count: { $sum: 1 },
            strong_relationships: {
              $sum: { $cond: [{ $eq: ['$relationship_info.strength', 'strong'] }, 1, 0] }
            }
          }
        },
        {
          $group: {
            _id: '$_id.category',
            types: {
              $push: {
                type: '$_id.type',
                count: '$count',
                strong_count: '$strong_relationships'
              }
            },
            total_count: { $sum: '$count' },
            total_strong: { $sum: '$strong_relationships' }
          }
        }
      ]).toArray();

      res.json({
        success: true,
        data: {
          category_stats: stats,
          summary: {
            total_relationships: stats.reduce((sum, cat) => sum + cat.total_count, 0),
            strong_relationships: stats.reduce((sum, cat) => sum + cat.total_strong, 0),
            categories_count: stats.length
          }
        }
      });

    } catch (error) {
      console.error('관계 통계 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '관계 통계 조회 중 오류가 발생했습니다.'
      });
    }
  });

  console.log('✅ 고객 관계 관리 라우트가 설정되었습니다.');
  console.log('  POST /api/customers/:id/relationships - 관계 생성');
  console.log('  GET  /api/customers/:id/relationships - 관계 조회');
  console.log('  GET  /api/customers/:id/network-analysis - 네트워크 분석');
  console.log('  PUT  /api/customers/:id/relationships/:relationshipId - 관계 수정');
  console.log('  DELETE /api/customers/:id/relationships/:relationshipId - 관계 삭제');
  console.log('  GET  /api/relationship-types - 관계 유형 목록');
  console.log('  GET  /api/customers/:id/relationship-stats - 관계 통계');
};

module.exports = { setupCustomerRelationshipRoutes, RELATIONSHIP_TYPES, getAllRelationshipTypes };